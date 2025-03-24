import type { AllPings, Ping } from "../../data/source";
import type { IndexedStringPingField } from "../../data/format";
import type { MultiselectFilterSpec } from "./MultiselectFilter";

export type FieldValue = number;

export type FilterField = IndexedStringPingField;

export type { AllPings, Ping, FilterSpec };
export default interface FilterSpec {
    build(pings: AllPings): MultiselectFilterSpec[];
}
