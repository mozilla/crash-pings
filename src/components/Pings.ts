import { createEffect, createMemo, on, untrack } from "solid-js";
import html from "solid-js/html";
import SingleSelectable from "app/components/Selectable";
import { SignatureInfo } from "app/components/Signatures";
import type { Ping } from "app/data/source";
import { allPings } from "app/data/source";
import Layout from "app/components/Layout";
import { VList } from "virtua/solid";
import settings from "app/settings";

export class PingInfo extends SingleSelectable(Object) {
    ping: Ping;

    constructor(ping: Ping) {
        super();
        this.ping = ping;
    }
}

export default function Pings(props: {
    signature: SignatureInfo,
    selectedPing?: (ping: PingInfo | undefined) => void,
}) {
    const selectPing = (ping: PingInfo | undefined) => {
        PingInfo.setSelected(ping);
        settings.pingCrashId = ping ? pingData.crashid[ping.ping] : undefined;
        if (props.selectedPing) {
            props.selectedPing(ping);
        }
    };

    const pingData = allPings();
    const pingInfos = createMemo(() => {
        const infos = props.signature.pings.map(ping => new PingInfo(ping));

        // Load settings
        {
            const pingCrashId = untrack(() => settings.pingCrashId);
            if (pingCrashId) {
                const ping: Ping | -1 = pingData.crashid.indexOf(pingCrashId);
                if (ping !== -1) {
                    const info = infos.find(i => i.ping == ping);
                    if (info) selectPing(info);
                }
            }
        }

        return infos;
    });

    let firstRun = true;
    // Clear the selected ping whenever the selected signature changes.
    createEffect(on(() => props.signature, () => {
        if (firstRun) {
            firstRun = false;
            return;
        }
        selectPing(undefined);
    }));

    const renderPingInfo = (info: PingInfo) => html`
        <div role="row" class="listrow" classList=${() => info.selectedClassList} onClick=${(_: Event) => selectPing(info)}>
            <div role="cell" class="ping-date">${pingData.date.getPingString(info.ping)}</div>
            <div role="cell" class="ping-type">${pingData.type.getPingString(info.ping)}</div>
            <div role="cell" class="ping-reason">${pingData.reason.getPingString(info.ping) ?? '(empty)'}</div>
        </div>
    `;

    return html`
        <${Layout} column role="table">
            <${Layout} size="content">
                <h3>Pings</h3>
                <div role="row" class="listrow listheader">
                    <div role="columnheader" class="ping-date">Date</div>
                    <div role="columnheader" class="ping-type">Crash Type</div>
                    <div role="columnheader" class="ping-reason">Reason</div>
                </div>
            <//>
            <${Layout} fill>
                <${VList} role="rowgroup" data=${pingInfos}>${renderPingInfo}<//>
            <//>
        <//>
    `;
};
