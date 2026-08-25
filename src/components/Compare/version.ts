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

export type Parsed<T> = { success: T } | { errors: ParseError[] } | { next: true };
export type ParseError = { message: string, start: number, length: number };

class ParseInput {
    s: string;
    offset: number;

    constructor(s: string, offset: number) {
        this.s = s;
        this.offset = offset;
    }

    error<T>(message: string): Parsed<T> {
        return { errors: [{ message, start: this.offset, length: this.s.length }] };
    }

    forward(chars: number): ParseInput {
        return new ParseInput(this.s.substring(chars), this.offset + chars);
    }

    backward(chars: number): ParseInput {
        return new ParseInput(this.s.substring(0, this.s.length - chars), this.offset);
    }

    matchStart(start: string): MatchParseInput | null {
        const matches = this.s.match(new RegExp("^\\s*" + start + "\\s*", "d"));
        if (!matches) {
            return null;
        }
        return new MatchParseInput(
            this.forward(matches[0].length),
            matches.indices!.map(([s, e]) => new ParseInput(this.s.substring(s, e), this.offset + s))
        );
    }

    matchEnd(end: string): MatchParseInput | null {
        const matches = this.s.match(new RegExp(end + "\\s*$", "d"));
        if (!matches) {
            return null;
        }
        return new MatchParseInput(
            this.backward(matches[0].length),
            matches.indices!.map(([s, e]) => new ParseInput(this.s.substring(s, e), this.offset + s))
        );
    }
}

class MatchParseInput extends ParseInput {
    matches: ParseInput[];

    constructor(base: ParseInput, matches: ParseInput[]) {
        super(base.s, base.offset);
        this.matches = matches;
    }
}

class Parser<Out, In = ParseInput> {
    call: (i: In) => Parsed<Out>;

    constructor(call: (i: In) => Parsed<Out>) {
        this.call = call;
    }

    pipe<U>(next: Parser<U, Out>): Parser<U, In> {
        return new Parser(input => {
            const result = this.call(input);
            if ("success" in result) {
                return next.call(result.success);
            } else {
                return result;
            }
        });
    }

    then<U>(next: Parser<U, Out>): Parser<U, In> {
        return new Parser(input => {
            const result = this.call(input);
            if ("success" in result) {
                return next.call(result.success);
            } else {
                return { next: true };
            }
        });
    }

    many(): Parser<Out[], In[]> {
        return new Parser(is => collect(is.map(this.call)));
    }

    map<U>(t: (i: Out) => U): Parser<U, In> {
        return new Parser(i => {
            const result = this.call(i);
            if ("success" in result) {
                try {
                    return { success: t(result.success) };
                } catch (message) {
                    if (typeof message === "string" && i instanceof ParseInput) {
                        return i.error(message);
                    } else {
                        throw message;
                    }
                }
            } else {
                return result;
            }
        });
    }

    withMatches<M>(matches: (Parser<M> | null)[]): Parser<[Out, (M | null)[]], MatchParseInput> {
        return new Parser(input => {
            const matchResults: Parsed<M | null>[] = [];
            for (let i = 0; i < Math.min(input.matches.length, matches.length); i++) {
                const matchParser = matches[i];
                matchResults.push(matchParser ? matchParser.call(input.matches[i]) : { success: null });
            }
            return concat(this.call(input as In), collect(matchResults));
        });
    }
}

export function getVersions(s: string): { success: VersionConstraint[] } | { errors: ParseError[] } {
    const result = parseVersions.call(new ParseInput(s.toLowerCase(), 0));
    if ("next" in result) {
        throw new Error("unterminated next");
    }
    return result;
}

const optZero = new Parser<0>(input => {
    if (input.s == "0") {
        return { success: 0 };
    } else {
        return { next: true };
    }
});

const word = new Parser<string>(input => {
    const matches = input.s.match(/\s*\w+\s*/);
    if (!matches) {
        return input.error("expected word");
    }
    return {
        success: matches[0].trim()
    };
});

const nonZeroNumber = new Parser<number>(input => {
    if (!input.s.match(/^[1-9][0-9]*$/)) {
        return input.error("expected a number");
    } else {
        const num = parseInt(input.s);
        if (isNaN(num)) {
            return input.error("invalid decimal number");
        }
        return { success: num };
    }
});

const number = or([optZero, nonZeroNumber]);

const dottedVersion = split(".")
    .pipe(number.many())
    .map(nums => {
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
    });

const build = keyword("build")
    .then(word.map(build => { return { build }; }));

const nightlyNum =
    suffixKeyword("a1")
        .then(suffixKeyword(".0", true))
        .then(nonZeroNumber.map(major => { return { major }; }));

const betaNum =
    suffixKeyword("b([1-9][0-9]*)")
        .then(suffixKeyword(".0", true)
            .then(nonZeroNumber)
            .withMatches([null, nonZeroNumber])
            .map(([major, [_, betanumber]]) => {
                return { major, betanumber: betanumber! };
            }));

const nightlyKeyed =
    keyword("nightly")
        .then(
            or<BuildOr<{ major: number }>>([
                build,
                nightlyNum,
                nonZeroNumber.map(major => { return { major }; })
            ]).map(setChannel("nightly"))
        );

const betaKeyed =
    keyword("beta")
        .then(
            or<BuildOr<{ major: number }>>([
                build,
                betaNum,
                nonZeroNumber.map(major => { return { major }; })
            ]).map(setChannel("beta"))
        );

const esrKeyed =
    keyword("esr")
        .then(
            or<BuildOr<{ major: number, minor?: number, patch?: number }>>([
                build,
                dottedVersion
            ]).map(setChannel("esr"))
        );

const parseVersion = or<VersionConstraint>([
    nightlyKeyed,
    betaKeyed,
    esrKeyed,
    build.map(setChannel("release")),
    nightlyNum.map(setChannel("nightly")),
    betaNum.map(setChannel("beta")),
    dottedVersion.map(setChannel("release")),
]);

const parseVersions = split(",").pipe(parseVersion.many());

function setChannel<S extends string, T>(which: S): (i: T) => T & { channel: S } {
    return i => {
        return { channel: which, ...i };
    }
}

function split(delim: string): Parser<ParseInput[]> {
    return new Parser(input => {
        const parts = input.s.split(delim);
        const reduced = parts.reduce<{ ret: ParseInput[], offset: number }>((r, s) => {
            r.ret.push(new ParseInput(s, r.offset));
            r.offset += s.length + delim.length;
            return r;
        }, { ret: [], offset: input.offset });
        return { success: reduced.ret };
    });
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

function keyword(word: string): Parser<MatchParseInput> {
    return new Parser(input => {
        const matched = input.matchStart(word);
        if (!matched) {
            return input.error(`expected '${word}'`);
        }
        return { success: matched };
    });
}

function suffixKeyword(word: string, optional: true): Parser<ParseInput | MatchParseInput>;
function suffixKeyword(word: string, optional: false): Parser<MatchParseInput>;
function suffixKeyword(word: string): Parser<MatchParseInput>;
function suffixKeyword(word: string, optional: boolean = false): Parser<ParseInput | MatchParseInput> {
    return new Parser(input => {
        const matched = input.matchEnd(word);
        if (!matched) {
            if (optional) {
                return { success: input };
            } else {
                return input.error(`expected '${word}'`);
            }
        }
        return { success: matched };
    });
}

function or<T, I = ParseInput>(options: Parser<T, I>[]): Parser<T, I> {
    return new Parser(input => {
        for (const f of options) {
            const result = f.call(input);
            if ("next" in result) {
                continue;
            }
            return result;
        }
        throw new Error("non-exhaustive or");
    });
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
