import { ATMap } from "../../../types/map.ts";
import { PlaneConfig, WaterConfig } from "../../../types/assets.ts";

export const demoMap: ATMap = {
    "items": [
        {
            "normalMap0": "/assets/water/normal0.jpg",
            "type": "water",
            "normalMap1": "/assets/water/normal1.jpg",
            "flowMap": "/textures/water/flowmap_water.png"
        } as WaterConfig
        , {
            "type": "plane",
            "texture": "/assets/textures/green-grass-textures.jpg",
            "size": 1000,
            "heightMap": "/textures/water/heightmap_v2.png"
        } as PlaneConfig, {

            "w": 5,
            "z": 12.314450267020987,
            "type": "rect",
            "h": 5,
            "y": 307.06249796784357,
            "x": 441.67322906990273
        }, {
            "h": 5,
            "type": "rect",
            "x": 459.7864594109325,
            "w": 5,

            "y": 296.517304379779,
            "z": 12.368096901156093
        }, {
            "x": 431.7668143822658,
            "w": 5,
            "y": 294.2157112859186,
            "z": 13.070385357014302,
            "type": "rect",
            "h": 5
        }, {
            "h": 5,
            "w": 5,
            "x": 477.3882484838799,

            "type": "rect",
            "y": 296.36434929361974,
            "z": 13.050388192092
        }, {
            "w": 5,
            "h": 5,

            "y": 296.9763330108215,
            "type": "rect",
            "z": 12.377285586693333,
            "x": 494.1137722183827
        }, {
            "type": "rect",
            "x": 512.8000618577419,
            "w": 5,
            "z": 11.649866607497145,
            "y": 297.32370476018366,
            "h": 5
        }, {
            "z": 11.61074572916003,
            "w": 5,

            "type": "rect",
            "h": 5,
            "x": 526.524526964487,
            "y": 296.96785507633996
        }, {

            "x": 513.7792375252322,
            "y": 309.3313176056262,
            "z": 11.221705476988703,
            "type": "rect",
            "w": 5,
            "h": 5
        }, {
            "type": "rect",
            "x": 512.6483655870813,
            "z": 11.911888323170523,
            "w": 5,
            "y": 285.35920265684547,
            "h": 5,
        }
    ], "id": "fallback", "author": "", "name": "0000-0000 (Offline)"
};