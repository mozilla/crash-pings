import type { AllPings, Ping } from "../../data/source";
import type { MultiselectFilterSpec } from "./MultiselectFilter";

export type FieldValue = string | null;

export type PingStringField = keyof {
    [Key in keyof Ping as Ping[Key] extends FieldValue ? Key : never]: any;
};

export type { AllPings, Ping, FilterSpec };
export default interface FilterSpec {
    build(pings: AllPings): void;
    finish(): MultiselectFilterSpec[];
}
