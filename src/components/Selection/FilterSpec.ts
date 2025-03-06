import type { AllPings, Ping } from "../../data/source";
import type { IStringPingField } from "../../data/format";
import type { MultiselectFilterSpec } from "./MultiselectFilter";

export type FieldValue = number;

export type FilterField = IStringPingField;

export type { AllPings, Ping, FilterSpec };
export default interface FilterSpec {
    build(pings: AllPings): MultiselectFilterSpec[];
}
