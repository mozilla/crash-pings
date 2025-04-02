import { sources, type Source } from "../../data/source";
import Layout from "../Layout";
import html from "solid-js/html";
import { For } from "solid-js";
import "./component.css";

function renderSource(source: Source) {
    const style = () => {
        const status = source.status();
        const ret: { [key: string]: string } = {};
        if ("success" in status) {
            const color = status.success ? "green" : "red";
            ret["border-color"] = color;
            ret["background-color"] = color;
        }
        return ret;
    };
    const date = new Date(source.date);
    const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" });
    const month = monthFormatter.format(date);
    const day = date.getUTCDate();
    return html`<div class="source-status" style=${style}>
        <div class="cal">
            <div class="month"><span class="shrink">${month}</span></div>
            <div class="day"><span class="shrink">${day}</span></div>
        </div>
        <div class="message">${() => source.status().message}</div>
    </div>`;
}

export default function SourceStatus(_props: {}) {
    return html`<${Layout} column>
        <${For} each=${sources}>${renderSource}<//>
    <//>`;
}
