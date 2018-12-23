## Accurate Overview

Shows a 2D overview map for a 3D scene with a geometry representing the section of the earth's surface visible in the scene.

### Demo

https://solowt.github.io/accurate-overview

### Method

1. Calculate horizon based on camera position (ignore fov/heading for now)
2. Project horizon to screen
3. Clamp screen coordinates to screen min/max
4. Reproject to map

### Other Stuff

A polyline is used to show the section of the scene that's visible.  A polygon would be better, but in some situations the polygon is not filled correctly (for example, when the camera is pointed at either pole).

All the mapping/visualization uses the [esri JavaScript API](https://developers.arcgis.com/javascript/)