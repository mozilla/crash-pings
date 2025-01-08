function getY(max: number, height: number, diff: number, value: number): number {
  return parseFloat((height - (value * height / max) + diff).toFixed(2));
}

function removeChildren(svg: SVGElement) {
  svg.querySelectorAll("*").forEach(element => svg.removeChild(element));
}

function defaultFetch(entry: Entry) {
  return entry.value;
}

function buildElement(tag: string, attrs: { [key: string]: string | number }) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);

  for (let name in attrs) {
    element.setAttribute(name, attrs[name].toString());
  }

  return element;
}

type Entry = { value: number, [key: string]: any };
type Options = {
  onmousemove?: (event: MouseEvent, currentdatapoint: DataPoint) => void,
  onmouseout?: (event: MouseEvent) => void,
  spotRadius?: number,
  interactive?: boolean,
  cursorWidth?: number,
  fetch?: (entry: Entry) => number,
};
type DataPoint = {
  value: number,
  index: number,
  x: number,
  y: number,
  [key: string]: any
};

function requireAttr(svg: SVGElement, field: string): string {
  const item = svg.attributes.getNamedItem(field)?.value;
  if (item === undefined) {
    throw new Error(`${field} missing`);
  }
  return item;
}

export function sparkline(svg: SVGElement, entries: number[] | Entry[], options: Options) {
  removeChildren(svg);

  if (entries.length <= 1) {
    return;
  }

  options = options || {};

  if (typeof (entries[0]) === "number") {
    entries = entries.map(entry => {
      return { value: entry as number };
    });
  }
  entries = entries as Entry[];

  // This function will be called whenever the mouse moves
  // over the SVG. You can use it to render something like a
  // tooltip.
  const onmousemove = options.onmousemove;

  // This function will be called whenever the mouse leaves
  // the SVG area. You can use it to hide the tooltip.
  const onmouseout = options.onmouseout;

  // Should we run in interactive mode? If yes, this will handle the
  // cursor and spot position when moving the mouse.
  const interactive = ("interactive" in options) ? options.interactive : !!onmousemove;

  // Define how big should be the spot area.
  const spotRadius = options.spotRadius || 2;
  const spotDiameter = spotRadius * 2;

  // Define how wide should be the cursor area.
  const cursorWidth = options.cursorWidth || 2;

  // Get the stroke width; this is used to compute the
  // rendering offset.
  const strokeWidth = parseFloat(requireAttr(svg, "stroke-width"));

  // By default, data must be formatted as an array of numbers or
  // an array of objects with the value key (like `[{value: 1}]`).
  // You can set a custom function to return data for a different
  // data structure.
  const fetch = options.fetch || defaultFetch;

  // Retrieve only values, easing the find for the maximum value.
  const values = entries.map(entry => fetch(entry));

  // The rendering width will account for the spot size.
  const width = parseFloat(requireAttr(svg, "width")) - spotDiameter * 2;

  // Get the SVG element's full height.
  const fullHeight = parseFloat(requireAttr(svg, "height"));

  // The rendering height accounts for stroke width and spot size.
  const height = fullHeight - (strokeWidth * 2) - spotDiameter;

  // The maximum value. This is used to calculate the Y coord of
  // each sparkline datapoint.
  const max = Math.max(...values);

  // Some arbitrary value to remove the cursor and spot out of
  // the viewing canvas.
  const offscreen = -1000;

  // Cache the last item index.
  const lastItemIndex = values.length - 1;

  // Calculate the X coord base step.
  const offset = width / lastItemIndex;

  // Hold all datapoints, which is whatever we got as the entry plus
  // x/y coords and the index.
  const datapoints: DataPoint[] = [];

  // Hold the line coordinates.
  const pathY = getY(max, height, strokeWidth + spotRadius, values[0]);
  let pathCoords = `M${spotDiameter} ${pathY}`;

  values.forEach((value, index) => {
    const x = index * offset + spotDiameter;
    const y = getY(max, height, strokeWidth + spotRadius, value);

    datapoints.push(Object.assign({}, entries[index] as { value: number }, {
      index: index,
      x: x,
      y: y
    }));

    pathCoords += ` L ${x} ${y}`;
  });

  const path = buildElement("path", {
    class: "sparkline--line",
    d: pathCoords,
    fill: "none"
  });

  let fillCoords = `${pathCoords} V ${fullHeight} L ${spotDiameter} ${fullHeight} Z`;

  const fill = buildElement("path", {
    class: "sparkline--fill",
    d: fillCoords,
    stroke: "none"
  });

  svg.appendChild(fill);
  svg.appendChild(path);

  if (!interactive) {
    return;
  }

  const cursor = buildElement("line", {
    class: "sparkline--cursor",
    x1: offscreen,
    x2: offscreen,
    y1: 0,
    y2: fullHeight,
    "stroke-width": cursorWidth
  });

  const spot = buildElement("circle", {
    class: "sparkline--spot",
    cx: offscreen,
    cy: offscreen,
    r: spotRadius
  });

  svg.appendChild(cursor);
  svg.appendChild(spot);

  const interactionLayer = buildElement("rect", {
    width: requireAttr(svg, "width"),
    height: requireAttr(svg, "height"),
    style: "fill: transparent; stroke: transparent",
    class: "sparkline--interaction-layer",
  });
  svg.appendChild(interactionLayer);

  interactionLayer.addEventListener("mouseout", event => {
    cursor.setAttribute("x1", offscreen.toString());
    cursor.setAttribute("x2", offscreen.toString());

    spot.setAttribute("cx", offscreen.toString());

    if (onmouseout) {
      onmouseout(event);
    }
  });

  interactionLayer.addEventListener("mousemove", event => {
    const mouseX = event.offsetX;

    let nextDataPoint = datapoints.find(entry => {
      return entry.x >= mouseX;
    });

    if (!nextDataPoint) {
      nextDataPoint = datapoints[lastItemIndex];
    }

    let previousDataPoint = datapoints[datapoints.indexOf(nextDataPoint) - 1];
    let currentDataPoint;
    let halfway;

    if (previousDataPoint) {
      halfway = previousDataPoint.x + ((nextDataPoint.x - previousDataPoint.x) / 2);
      currentDataPoint = mouseX >= halfway ? nextDataPoint : previousDataPoint;
    } else {
      currentDataPoint = nextDataPoint;
    }

    const x = currentDataPoint.x;
    const y = currentDataPoint.y;

    spot.setAttribute("cx", x.toString());
    spot.setAttribute("cy", y.toString());

    cursor.setAttribute("x1", x.toString());
    cursor.setAttribute("x2", x.toString());

    if (onmousemove) {
      onmousemove(event, currentDataPoint);
    }
  });
}

function findClosest(target: Element, tagName: string) {
  while (target && target.tagName !== tagName) {
    target = target.parentNode as Element;
  }
  return target;
}

const sloptions: Options = {
  onmousemove(event, datapoint) {
    var svg = findClosest(event.target as Element, "svg");
    var date = (new Date(datapoint["date"])).toDateString();

    var valueElement = svg.previousElementSibling!;
    valueElement.textContent = '' + datapoint.value.toFixed(0) + ' - ' + date;
  }
};

export function makeSparkline(el: SVGElement, data: Entry[]) {
  sparkline(el, data, sloptions);
}
