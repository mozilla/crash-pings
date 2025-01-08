import html from "solid-js/html";
import "./layout.css";

type Marker = boolean | "";

function getMarker(value?: Marker): boolean;
function getMarker<T>(value?: T | Marker): T | boolean;
function getMarker<T>(value?: T | Marker): T | boolean {
    if (value === undefined) {
        return false;
    }
    if (value === "") {
        return true;
    }
    return value;
}

export default function Layout(props: {
    column?: Marker,
    row?: Marker,
    size?: string,
    fill?: number | Marker,
    children: any,
}) {
    const classes = () => {
        return {
            "layout": true,
            "col": getMarker(props.column),
            "row": getMarker(props.row),
        };
    };
    const style = () => {
        const ret: { [key: string]: string } = {};
        if (props.size) {
            ret["flex-basis"] = props.size;
            ret["flex-grow"] = "0";
            ret["flex-shrink"] = "0";
        }
        const fill = (props.fill === undefined && props.size === undefined) ? true : getMarker(props.fill);
        if (fill) {
            ret["flex-grow"] = (fill === true ? 1 : fill).toString();
            ret["flex-shrink"] = "1";
        }
        return ret;
    };
    return html`<div style=${style} classList=${classes}>${props.children}</div>`;
}
