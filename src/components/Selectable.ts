import { createSignal } from "solid-js";
import type { Accessor, Setter } from "solid-js";

type Constructor = new (...args: any[]) => {};

export default function SingleSelectable<TBase extends Constructor>(Base: TBase) {
    return class SingleSelectable extends Base {
        #selected: Accessor<boolean>;
        #setSelected: Setter<boolean>;

        get selected() { return this.#selected(); }
        set selected(value: boolean) { this.#setSelected(value); }
        get selectedClassList() { return { "selected": this.selected }; }

        static #currentSelected: SingleSelectable | undefined;
        static setSelected(which: SingleSelectable | undefined) {
            if (SingleSelectable.#currentSelected) {
                SingleSelectable.#currentSelected.selected = false;
            }
            SingleSelectable.#currentSelected = which;
            if (SingleSelectable.#currentSelected) {
                SingleSelectable.#currentSelected.selected = true;
            }
        }

        constructor(...args: any[]) {
            super(...args);
            const [selected, setSelected] = createSignal(false);
            this.#selected = selected;
            this.#setSelected = setSelected;
        }
    };
}
