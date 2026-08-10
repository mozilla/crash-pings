export const VERSION_HELP = `
Versions can be provided as a comma-separated list (case and whitespace \
between words is ignored),
where each version is:
- Nightly channel: nightly (<maj>|<build>) | <maj>[.0]a1
- Beta channel: beta (<maj>|<build>) | <maj>[.0]b<beta number>
- Release channel: <maj>[.<min>[.<patch>]]|<build>
- ESR channel: esr (<maj>[.<min>[.<patch>]]|<build>)

<maj>/<min>/<patch> must be numbers, and these forms will automatically \
include relevant versions for other channels.

<build>s are of the form "build<buildid>", and will not include relevant \
versions for other channels (so be sure to manually include them if needed).
`.trim();

export type BuildOr<T> = {
    build: string
} | T;

export type VersionConstraint =
    ({ channel: "nightly" } & BuildOr<{ major: number }>)
    | ({ channel: "beta" } & BuildOr<{ major: number, betanumber?: number }>)
    | ({ channel: "release" | "esr" } & BuildOr<{ major: number, minor?: number, patch?: number }>);

export type ParseError = { message: string, start: number, length: number };
export type Parsed<T> = { success: T } | { errors: ParseError[] } | { next: true };

type ParseInput = { s: string, offset: number };
type Parser<T> = (i: ParseInput) => Parsed<T>;

export function getVersions(s: string): Parsed<VersionConstraint[]> {
    return parseVersions({ s: s.toLowerCase(), offset: 0 });
}

const zeroOrNumber = or([optZero, number]);

const dottedVersion = map(
    pipe(split("."), parseMany(zeroOrNumber)),
    nums => {
        if (nums.length == 0) {
            throw "expected a number";
        }
        if (nums.length > 3) {
            throw "expected at most 3 components";
        }
        if (nums[0] == 0) {
            throw "major number cannot be 0";
        }
        return {
            major: nums.at(0)!,
            minor: nums.at(1),
            patch: nums.at(2)
        };
    }
);

const build = then(
    keyword("build"),
    map(word, build => { return { build }; })
);

const nightlyNum = then(
    suffixKeyword("a1"),
    then(
        suffixKeyword(".0", true),
        map(number, major => { return { major }; })
    )
);

const betaNum = then(
    suffixKeyword("b([1-9][0-9]*)"),
    map(
        withMatches(
            then(suffixKeyword(".0", true), number),
            [null, number]
        ),
        ([major, [_, betanumber]]) => {
            return { major, betanumber: betanumber! };
        }
    )
);

const nightlyKeyed = then(
    keyword("nightly"),
    map(
        or<BuildOr<{ major: number }>>([
            build,
            nightlyNum,
            map(number, major => { return { major }; })
        ]),
        setChannel("nightly")
    )
);

const betaKeyed = then(
    keyword("beta"),
    map(
        or<BuildOr<{ major: number }>>([
            build,
            betaNum,
            map(number, major => { return { major }; })
        ]),
        setChannel("nightly")
    )
);

const esrKeyed = then(
    keyword("esr"),
    map(
        or<BuildOr<{ major: number, minor?: number, patch?: number }>>([
            build,
            dottedVersion
        ]),
        setChannel("nightly")
    )
);

const parseVersion = or<VersionConstraint>([
    nightlyKeyed,
    betaKeyed,
    esrKeyed,
    map(build, setChannel("release")),
    map(nightlyNum, setChannel("nightly")),
    map(betaNum, setChannel("beta")),
    map(dottedVersion, setChannel("release")),
]);

const parseVersions = pipe(split(","), parseMany(parseVersion));

function setChannel<S extends string, T>(which: S): (i: T) => T & { channel: S } {
    return i => {
        return { channel: which, ...i };
    }
}

function optZero(input: ParseInput): Parsed<0> {
    if (input.s == "0") {
        return { success: 0 };
    } else {
        return { next: true };
    }
}

function split(delim: string): Parser<ParseInput[]> {
    return input => {
        const parts = input.s.split(delim);
        const reduced = parts.reduce<{ ret: ParseInput[], offset: number }>((r, s) => {
            r.ret.push({ s, offset: r.offset });
            r.offset += s.length + delim.length;
            return r;
        }, { ret: [], offset: input.offset });
        return { success: reduced.ret };
    }
}

type MatchParseInput = ParseInput & { matches: ParseInput[] };

function word(input: ParseInput): Parsed<string> {
    const matches = input.s.match(/\s*\w+\s*/);
    if (!matches) {
        return error(input, "expected word");
    }
    return {
        success: matches[0].trim()
    };
}

function matchStart(input: ParseInput, start: string): MatchParseInput | null {
    const matches = input.s.match(new RegExp("^\\s*" + start + "\\s*", "d"));
    if (!matches) {
        return null;
    }
    return {
        matches: matches.indices!.map(([s, e]) => { return { s: input.s.substring(s, e), offset: input.offset + s }; }),
        ...forward(input, matches[0].length)
    };
}

function matchEnd(input: ParseInput, end: string): MatchParseInput | null {
    const matches = input.s.match(new RegExp(end + "\\s*$", "d"));
    if (!matches) {
        return null;
    }
    return {
        matches: matches.indices!.map(([s, e]) => { return { s: input.s.substring(s, e), offset: input.offset + s }; }),
        ...backward(input, matches[0].length)
    };
}

function withMatches<T, M>(main: Parser<T>, matches: (Parser<M> | null)[]): (i: MatchParseInput) => Parsed<[T, (M | null)[]]> {
    return input => {
        const matchResults: Parsed<M | null>[] = [];
        for (let i = 0; i < Math.min(input.matches.length, matches.length); i++) {
            const matchParser = matches[i];
            matchResults.push(matchParser ? matchParser(input.matches[i]) : { success: null });
        }
        return concat(main(input), collect(matchResults));
    }
}

function number(input: ParseInput): Parsed<number> {
    if (!input.s.match(/^[1-9][0-9]*$/)) {
        return error(input, "expected a number");
    } else {
        const num = parseInt(input.s);
        if (isNaN(num)) {
            return error(input, "invalid decimal number");
        }
        return { success: num };
    }
}

function concat<T, U>(a: Parsed<T>, b: Parsed<U>): Parsed<[T, U]> {
    if ("success" in a) {
        if ("success" in b) {
            return { success: [a.success, b.success] };
        } else {
            return b;
        }
    } else if ("errors" in a) {
        if ("errors" in b) {
            return { errors: a.errors.concat(b.errors) };
        }
        return a;
    }
    return a;
}

function pipe<T, U>(first: Parser<T>, f: (i: T) => Parsed<U>): Parser<U> {
    return input => {
        const result = first(input);
        if ("success" in result) {
            return f(result.success);
        } else {
            return result;
        }
    };
}

function then<T, U>(cond: Parser<T>, f: (i: T) => Parsed<U>): Parser<U> {
    return input => {
        const result = cond(input);
        if ("success" in result) {
            return f(result.success);
        } else {
            return { next: true };
        }
    };
}

function keyword(word: string): Parser<MatchParseInput> {
    return input => {
        const matched = matchStart(input, word);
        if (!matched) {
            return error(input, `expected '${word}'`);
        }
        return { success: matched };
    };
}

function suffixKeyword(word: string, optional: true): Parser<ParseInput & { matches?: ParseInput[] }>;
function suffixKeyword(word: string, optional: false): Parser<MatchParseInput>;
function suffixKeyword(word: string): Parser<MatchParseInput>;
function suffixKeyword(word: string, optional: boolean = false): Parser<ParseInput & { matches?: ParseInput[] }> {
    return input => {
        const matched = matchEnd(input, word);
        if (!matched) {
            if (optional) {
                return { success: input };
            } else {
                return error(input, `expected '${word}'`);
            }
        }
        return { success: matched };
    };
}

function or<T>(options: Parser<T>[]): Parser<T> {
    return input => {
        for (const f of options) {
            const result = f(input);
            if ("next" in result) {
                continue;
            }
            return result;
        }
        throw new Error("non-exhaustive or");
    };
}

function error<T>(input: ParseInput, message: string): Parsed<T> {
    return { errors: [{ message, start: input.offset, length: input.s.length }] };
}

function forward(input: ParseInput, chars: number): ParseInput {
    return { s: input.s.substring(chars), offset: input.offset + chars };
}

function backward(input: ParseInput, chars: number): ParseInput {
    return { s: input.s.substring(0, input.s.length - chars), offset: input.offset };
}

function parseMany<T>(f: Parser<T>): (is: ParseInput[]) => Parsed<T[]> {
    return is => collect(is.map(f));
}

function map<I extends ParseInput, T, U>(f: (i: I) => Parsed<T>, t: (i: T) => U): (i: I) => Parsed<U> {
    return i => {
        const result = f(i);
        if ("success" in result) {
            try {
                return { success: t(result.success) };
            } catch (message) {
                if (typeof message === "string") {
                    return error(i, message);
                } else {
                    throw message;
                }
            }
        } else {
            return result;
        }
    };
}

function collect<T>(is: Parsed<T>[]): Parsed<T[]> {
    return is.reduce<Parsed<T[]>>((cur, val) => {
        if ("errors" in val) {
            if ("errors" in cur) {
                cur.errors = cur.errors.concat(val.errors);
            } else {
                cur = { errors: val.errors };
            }
        } else if ("success" in cur) {
            if ("success" in val) {
                cur.success.push(val.success);
            }
        }
        return cur;
    }, { success: [] });
}
