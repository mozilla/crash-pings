export const PING_FIELDS = {
    channel: "istring",
    process: "istring",
    ipc_actor: "istring",
    clientid: "istring",
    crashid: "string",
    version: "istring",
    os: "istring",
    osversion: "istring",
    arch: "istring",
    date: "istring",
    reason: "istring",
    type: "istring",
    minidump_sha256_hash: "nstring",
    startup_crash: "boolean",
    build_id: "istring",
    signature: "istring",
} as const;

export type PingFields = typeof PING_FIELDS;
export type IStringPingField = keyof {
    [Key in keyof PingFields as PingFields[Key] extends "istring" ? Key : never]: any;
};

export function pingFields(): [keyof PingFields, PingFields[keyof PingFields]][] {
    return Object.entries(PING_FIELDS) as any;
}

export type TypeMap<IString> = {
    istring: IString,
    string: string,
    nstring: string | null,
    boolean: boolean | null,
};

type NoIString = Omit<TypeMap<null>, 'istring'>;
type Arrayify<T> = {
    [K in keyof T]: T[K][];
};

export type IStringData<Values> = { strings: string[], values: Values };

export interface ArrayTypeMap<IString> extends Arrayify<NoIString> {
    istring: IString,
}

export type StringIndex = number;
export type Pings<IString = IStringData<StringIndex[]>> = {
    [K in keyof PingFields]: ArrayTypeMap<IString>[PingFields[K]];
};

export function emptyPings<T>(emptyIString: () => T, emptyArray: () => any[] = () => []): Pings<T> {
    return Object.fromEntries(Object.entries(PING_FIELDS).map(([k, v]) => {
        if (v === "istring") {
            return [k, emptyIString()];
        } else {
            return [k, emptyArray()];
        }
    })) as any;
}
