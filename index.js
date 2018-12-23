require([
  "esri/Map",
  "esri/views/SceneView",
  "esri/views/MapView",
  "esri/core/watchUtils",
  "esri/Graphic",
  "esri/geometry/Circle",
  "esri/geometry/Polyline",
  "esri/geometry/SpatialReference"
], function(Map, SceneView, MapView, watchUtils, Graphic, Circle, Polyline, SpatialReference) {

  const mainMap = new Map({
    basemap: "hybrid",
    ground: "world-elevation"
  });
  
  const overviewMap = new Map({
    basemap: "topo"
  });

  const mainView = new SceneView({
    container: "viewDiv",
    map: mainMap
  });

  const mapView = new MapView({
    container: "overviewDiv",
    map: overviewMap,
    constraints: {
      rotationEnabled: false
    }
  });
  mapView.ui.components = [];

  mapView.when(() => {
    watchUtils.init(mainView, "camera", calcVisibleEarth.bind(this));

    mapView.on("immediate-click", e => {
      mainView.animation && mainView.animation.stop();
      mainView.goTo(e.mapPoint, { animate: false });
    })
  })
  
  // earth radius in meters
  const E_R = 6378137;

  const tmpSP = {};
  const tmpP = {
    type: "point",
    x: null,
    y: null,
    spatialReference: SpatialReference.WebMercator
  };
  
  const camSym = {
    type: "picture-marker",
    url: `data:image/svg+xml;base64,PHN2ZyBoZWlnaHQ9JzMwMHB4JyB3aWR0aD0nMzAwcHgnICBmaWxsPSIjMDAwMDAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2ZXJzaW9uPSIxLjEiIHg9IjBweCIgeT0iMHB4IiB2aWV3Qm94PSIwIDAgMTAwIDUwIiBlbmFibGUtYmFja2dyb3VuZD0ibmV3IDAgMCAxMDAgNTAiIHhtbDpzcGFjZT0icHJlc2VydmUiPjxwYXRoIGQ9Ik05NS4wMywwLjE5NmMtMi43MzQsMC0xMC43NjMsNC4xNTEtMTcuODM5LDkuMjI5bC02Ljk0NSw0Ljk4MmMwLTAuNjg0LDAtMS4zMzgsMC0xLjk1M0M3MC4yNDYsNS42LDYzLjA2OCwwLDU0LjI5OSwwICBIMTUuOTQ4QzcuMTc3LDAsMCw3LjAyMSwwLDE1LjYwNnYxOC41OTVDMCw0Mi43ODYsNy4xNzcsNDkuODEsMTUuOTQ4LDQ5LjgxaDM4LjM1MWM4Ljc3MSwwLDE1Ljk0Ny01LjYwNCwxNS45NDctMTIuNDUyICBjMC0wLjQ5OCwwLTEuMDIzLDAtMS41NjVsNi45NDUsNC45ODFDODQuMjY4LDQ1Ljg0OCw5Mi4yOTYsNTAsOTUuMDMsNTBjMi43MzMsMCw0Ljk3LTcuMDIxLDQuOTctMTUuNjA3VjE1LjgwMiAgQzEwMCw3LjIxOCw5Ny43NjYsMC4xOTYsOTUuMDMsMC4xOTZ6Ij48L3BhdGg+PC9zdmc+`
  }

  function clamp(num, min, max) {
    if (num < min)
      return min;
    if (num > max)
      return max;
    return num;
  }

  function calcVisibleEarth(cam) {
    // get radius of horizon circle
    const h = cam.position.z;
    const a = E_R/(E_R + h)
    const radius = Math.acos(a) * E_R;

    const center = cam.position.clone();
    center.z = undefined;
    center.hasZ = false;

    // create circle geometry representing horizon based on
    // camera position (ignore fov/heading for now)
    const circ = new Circle({
      radius: radius * .97,  // shrink horizon slightly.
      center: center,        // this ensures the geometry is on the visible surface of the scene
      geodesic: true,
      numberOfPoints: 45     // tweak numberOfPoints to adjust circle resolution.  higher number can be slow
    });

    const screenRing = [];

    // project circle to screen, then clamp to screen min/max, then reproject back to map
    for (let i = 0; i < circ.rings[0].length; i++) {
      const x = circ.rings[0][i][0];
      const y = circ.rings[0][i][1];
      mainView.toScreen(x, y, tmpSP);
      const clampedX = clamp(tmpSP.x, 0, mainView.width);
      const clampedY = clamp(tmpSP.y, 0, mainView.height);
      if (clampedX.x === tmpSP.x && clampedY === tmpSP.y) {
         screenRing.push([x, y]);
      }
      else {
        const p = mainView.toMap(clampedX, clampedY, tmpP);
        if (p) {
          screenRing.push([tmpP.x, tmpP.y]);
        } 
      }
    }

    mapView.graphics.removeAll();
    
    // set angle of camera symbol
    camSym.angle = cam.heading - 90;
    // create camera graphic
    const camGraphic = new Graphic({
      geometry: mainView.camera.position,
      symbol: camSym
    });

    // split the polyline representing the visible earth along the dateline. 
    const line = splitPolyline([screenRing]);

    // create final geometry for visible earth
    const polyline = new Polyline({
      paths: line,
      spatialReference: SpatialReference.WebMercator
    });

    // calculate new extent for overview map
    const viewExtent = getViewExtent(polyline.extent, mainView.camera.position, 1.75);
    mapView.goTo(viewExtent);
    
    // create graphic for visible section of earth
    const visibleEarthGraphic = new Graphic({
      geometry: polyline,
      symbol: {
        type: "simple-line",
        color: [0, 0, 125],
        width: 2,
        style: "short-dot"
      }
    });

    mapView.graphics.addMany([camGraphic, visibleEarthGraphic]);
  }
  
  // x bounds in web mercator
  const minX = -20037508.342788905;
  const maxX = 20037508.342788905;
  
  // cut line crossing -180/180 and re-assemble so it can be drawn
  // across dateline
  function splitPolyline(line) {
    const path = line[0];
    const ret = [[]];
    for (let i = 0; i < path.length - 1; i++) {
      const point = normalizePoint(path[i], maxX, minX);
      const next = normalizePoint(path[i + 1], maxX, minX);

      if (Math.sign(point[0]) === Math.sign(next[0])) {
        ret[ret.length - 1].push(point);
        continue;
      }

      let neg, pos;
      if (point[0] < 0) {
        neg = point[0];
        pos = next[0];
      }
      else {
        neg = next[0];
        pos = point[0];
      }

      const dx = pos - neg;
      const diffNeg = neg - minX;
      const diffPos = maxX - pos;
      const dx2 = (diffNeg) + (diffPos);

      if (dx2 < dx) {
        const dy = next[1] - point[1];
        const pre = point[0] === neg ? diffNeg : diffPos;
        const percent = pre / dx2;
        const newY = dy * percent + point[1];
        if (point[0] < 0) {
          ret[ret.length - 1].push([minX, newY])
          ret.push([[maxX, newY]])
        }
        else {
          ret[ret.length - 1].push([maxX, newY])
          ret.push([[minX, newY]])
        }
      }
      else {
        ret[ret.length - 1].push(point);
      }
    }
    ret[ret.length-1].push(ret[0][0]);
    return ret;
  }

  function normalizePoint(p, max, min) {
    const ret = p.slice();
    if (p[0] > max) {
      const offset = getOffset(p[0], max);
      ret[0] = p[0] + offset * (-2 * max);
    }
    else if (p[0] < min) {
      const offset = getOffset(p[0], min);
      ret[0] = p[0] + offset * (-2 * min);
    }
    return ret;
  }

  function getOffset(x, minMax){
    return Math.ceil((x - minMax) / (minMax * 2));
  }

  function getViewExtent(extent, point, growFactor) {
    const ret = extent.clone();
    ret.xmin = Math.min(point.x, extent.xmin);
    ret.xmax = Math.max(point.x, extent.xmax);
    ret.ymin = Math.min(point.y, extent.ymin);
    ret.ymax = Math.max(point.y, extent.ymax);
    return ret.expand(growFactor || 1.25);
  }
});