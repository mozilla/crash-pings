import { render } from "solid-js/web";
import html from "solid-js/html";
import { Router } from "@solidjs/router";
import App from "./components/App";
import Compare from "./components/Compare";

const routes = [
    {
        path: "/",
        component: App,
    },
    {
        path: "/compare",
        component: Compare,
    }
];

render(() => html`<${Router}>${routes}<//>`, document.body)
