import { createEffect, createMemo, on } from "solid-js";
import html from "solid-js/html";
import SingleSelectable from "./Selectable";
import { SignatureInfo } from "./Signatures";
import type { Ping } from "../data/source";
import { allPings } from "../data/source";
import Layout from "./Layout";
import { VList } from "virtua/solid";

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
        if (props.selectedPing) {
            props.selectedPing(ping);
        }
    };

    // Clear the selected ping whenever the selected signature changes.
    createEffect(on(() => props.signature, () => selectPing(undefined)));

    const pingData = allPings();
    const pingInfos = createMemo(() => props.signature.pings.map(ping => new PingInfo(ping)));

    const renderPingInfo = (info: PingInfo) => html`
        <div class="listrow" classList=${() => info.selectedClassList} onClick=${(_: Event) => selectPing(info)}>
            <div class="ping-date">${pingData.date.getPingString(info.ping)}</div>
            <div class="ping-type">${pingData.type.getPingString(info.ping)}</div>
            <div class="ping-reason">${pingData.reason.getPingString(info.ping) ?? '(empty)'}</div>
        </div>
    `;

    return html`
        <${Layout} column>
            <${Layout} size="content">
                <h2>Pings</h2>
                <div class="listrow listheader">
                    <div class="ping-date">Date</div>
                    <div class="ping-type">Crash Type</div>
                    <div class="ping-reason">Reason</div>
                </div>
            <//>
            <${Layout} fill>
                <${VList} data=${pingInfos}>${renderPingInfo}<//>
            <//>
        </div>
    `;
};
