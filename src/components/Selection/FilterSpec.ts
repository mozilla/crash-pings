import type { AllPings, Ping } from "app/data/source";
import type { IndexedStringPingField } from "app/data/format";
import type { MultiselectFilterSpec } from "./MultiselectFilter";

export type FieldValue = number;

export type FilterField = IndexedStringPingField;

export type { AllPings, Ping, FilterSpec };
export default interface FilterSpec {
    build(pings: AllPings): MultiselectFilterSpec[];
}
