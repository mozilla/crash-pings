import html from "solid-js/html";
import { splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import "./layout.css";

type Marker = boolean | "";

function getMarker(value: Marker | undefined): boolean;
function getMarker<T>(value: T | Marker | undefined): T | boolean;
function getMarker<T>(value: T | Marker | undefined, defaultPresent: T): T | undefined;
function getMarker<T>(value: T | Marker | undefined, defaultPresent?: T): any {
    if (defaultPresent !== undefined) {
        if (value === undefined || value === false) return undefined;
        if (value === "" || value === true) return defaultPresent;
    } else {
        if (value === undefined) return false;
        if (value === "") return true;
    }
    return value;
}

export default function Layout(props: {
    column?: Marker,
    row?: Marker,
    size?: string,
    fill?: number | Marker,
    gap?: number | false,
    frame?: Marker,
    style?: Record<string, string>,
    element?: string,
    children: any,
} & JSX.AriaAttributes & Pick<JSX.HTMLAttributes<HTMLElement>, "role">) {
    const element = props.element ?? "div";
    const classes = () => {
        return {
            "layout": true,
            "col": getMarker(props.column),
            "row": getMarker(props.row),
            "frame": getMarker(props.frame),
        };
    };
    const style = () => {
        const ret: Record<string, string> = props.style ?? {};
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
        if (props.gap !== undefined) {
            const gap = props.gap === false ? 0 : props.gap;
            ret["gap"] = `${gap}px`;
        }
        return ret;
    };

    const [forwarded, _] = splitProps(props, Object.keys(props).filter(k => k === "role" || k.startsWith("aria-")) as (keyof typeof props)[]);

    return html`<${Dynamic} component=${element} style=${style} classList=${classes} ...${forwarded}>${props.children}<//>`;
}
