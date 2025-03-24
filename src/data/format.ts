export const DATA_VERSION = 1;

// Symbolic ping field types.
const SIndexedString = Symbol("indexed string");
const SNullableIndexedString = Symbol("nullable indexed string");
const SString = Symbol("string");
const SNullableString = Symbol("nullable string");
const SNullableBoolean = Symbol("nullable boolean");

/**
 * Ping field definitions.
 */
const PING_FIELDS = Object.freeze({
    channel: SIndexedString,
    process: SIndexedString,
    ipc_actor: SNullableIndexedString,
    clientid: SIndexedString,
    crashid: SString,
    version: SIndexedString,
    os: SIndexedString,
    osversion: SIndexedString,
    arch: SIndexedString,
    date: SIndexedString,
    reason: SNullableIndexedString,
    type: SNullableIndexedString,
    minidump_sha256_hash: SNullableString,
    startup_crash: SNullableBoolean,
    build_id: SIndexedString,
    signature: SIndexedString,
});

/**
 * Basic ping field type and descriptor. We separate nullability for
 * convenience when validating ping data.
 */
export enum PingFieldType {
    IndexedString,
    String,
    Boolean,
}

export type PingFieldTypeDescriptor = {
    readonly type: PingFieldType;
    readonly nullable?: boolean;
};

/**
 * Mapping of symbolic ping field types to descriptors (which specify the type
 * and nullability in a more convenient form).
 */
const TYPE_DESCRIPTOR = {
    [SIndexedString]: Object.freeze({ type: PingFieldType.IndexedString }),
    [SNullableIndexedString]: Object.freeze({ type: PingFieldType.IndexedString, nullable: true }),
    [SString]: Object.freeze({ type: PingFieldType.String }),
    [SNullableString]: Object.freeze({ type: PingFieldType.String, nullable: true }),
    [SNullableBoolean]: Object.freeze({ type: PingFieldType.Boolean, nullable: true }),
};

export type PingFields = typeof PING_FIELDS;

/** All ping field keys which store PingFieldType.IndexedString. */
export type IndexedStringPingField = keyof {
    [Key in keyof PingFields as typeof TYPE_DESCRIPTOR[PingFields[Key]]["type"] extends PingFieldType.IndexedString ? Key : never]: any;
};

export function pingFields(): [keyof PingFields, PingFieldTypeDescriptor][] {
    return Object.entries(PING_FIELDS).map(([k, v]) => [k as keyof PingFields, TYPE_DESCRIPTOR[v] as PingFieldTypeDescriptor]);
}

export function getTypeDescriptor(field: keyof PingFields): PingFieldTypeDescriptor {
    return TYPE_DESCRIPTOR[PING_FIELDS[field]];
}

export type TypeMap<IString, NIString> = {
    [SIndexedString]: IString,
    [SNullableIndexedString]: NIString,
    [SString]: string,
    [SNullableString]: string | null,
    [SNullableBoolean]: boolean | null,
};

type NoIString = Omit<TypeMap<never, never>, typeof SIndexedString | typeof SNullableIndexedString>;
type Arrayify<T> = {
    [K in keyof T]: T[K][];
};

export type IStringData<String, Values> = { strings: String[], values: Values };

export type StringIndex = number;
export type Pings<IString = IStringData<string, StringIndex[]>, NIString = IStringData<string | null, StringIndex[]>> = {
    [K in keyof PingFields]: ({
        [SIndexedString]: IString,
        [SNullableIndexedString]: NIString,
    } & Arrayify<NoIString>)[PingFields[K]];
};

export function emptyPings<T>(emptyIString: () => T, emptyArray: () => any[] = () => []): Pings<T, T> {
    return Object.fromEntries(pingFields().map(([k, v]) => {
        if (v.type === PingFieldType.IndexedString) {
            return [k, emptyIString()];
        } else {
            return [k, emptyArray()];
        }
    })) as any;
}
