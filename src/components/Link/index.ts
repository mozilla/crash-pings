import html from "solid-js/html";
import { createSignal, Show } from "solid-js";
import "./component.css";
import settings, { save as saveSettings } from "app/Settings";

type BoolSetting = keyof {
    [Key in keyof typeof settings.meta as typeof settings.meta[Key] extends boolean ? Key : never]: any
};

function Checkbox(props: {
    field: BoolSetting,
    children: string,
}) {
    const change = (e: Event) => {
        settings.meta[props.field] = (e.currentTarget as HTMLInputElement).checked;
    };
    return html`<label>
        <input type="checkbox" checked=${() => settings.meta[props.field]} onChange=${change} />
        ${props.children}
    </label>`;
}

function expirationChange(e: Event) {
    const value = (e.currentTarget as HTMLInputElement).value;
    settings.meta.expiration = value;
}

export default function Link(_props: {}) {
    let linkSettingsTimer: Timer | undefined;
    const [label, setLabel] = createSignal("");

    const createLink = () => {
        dialog!.close();
        let l: string | undefined = label();
        if (l === "") {
            l = undefined;
        }
        setLabel("");
        saveSettings(l);
    };

    const saveLinkAuto = () => {
        settings.meta = {
            expiration: "1y",
            relativeDates: false,
            storeDates: true,
            storeSelection: true,
            storeSignature: true,
            storePing: true,
            storeSort: true,
            storeMeta: true,
        };
        saveSettings();
    };

    let dialog: HTMLDialogElement | undefined;

    const labelChange = (e: Event) => {
        setLabel((e.currentTarget as HTMLInputElement).value);
    }

    const longPress = () => {
        linkSettingsTimer = undefined;
        dialog!.showModal();
    };

    const down = (_: Event) => {
        linkSettingsTimer = setTimeout(longPress, 500);
    };

    const up = (_: Event) => {
        if (linkSettingsTimer) {
            clearTimeout(linkSettingsTimer);
            saveLinkAuto();
        }
    };

    const checkCloseDialog = (e: Event) => {
        if (e.target === dialog) {
            dialog!.close();
        }
    };

    return html`
        <button style="aspect-ratio: 1" onPointerdown=${down} onPointerup=${up} aria-haspopup="dialog">
            <span class="fa-solid fa-link"></span>
        </button>
        <dialog ref=${(e: HTMLDialogElement) => dialog = e} onClick=${checkCloseDialog} id="link-settings" class="frame">
            <div>
                <fieldset>
                    <legend>Preserve</legend>
                    <${Checkbox} field="storeDates">Dates<//>
                    <${Show} when=${() => settings.meta.storeDates}>
                        <${Checkbox} field="relativeDates">Make dates relative<//>
                    <//>
                    <${Checkbox} field="storeSelection">Filter selection<//>
                    <${Checkbox} field="storeSort">Signature sorting<//>
                    <${Checkbox} field="storeSignature">Selected signature<//>
                    <${Show} when=${() => settings.meta.storeSignature}>
                        <${Checkbox} field="storePing">Selected ping<//>
                    <//>
                    <${Checkbox} field="storeMeta">Link settings<//>
                </fieldset>
                <label>
                    Expiration: <input type="text" value=${() => settings.meta.expiration} onChange=${expirationChange} />
                </label>
                <label>
                    Label (optional): <input type="text" onChange=${labelChange} value=${label} />
                </label>
                <button onClick=${() => createLink()}>Create link</button>
            </div>
        </dialog>
    `;
}
