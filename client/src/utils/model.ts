import {GLTF, GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader";
import * as THREE from "three";
import {
    ArrowHelper,
    BoxGeometry,
    BufferGeometry,
    Color,
    CylinderGeometry,
    Group,
    Mesh,
    MeshPhongMaterial,
    MeshStandardMaterial,
    NormalBufferAttributes,
    Object3DEventMap,
    PerspectiveCamera,
    Quaternion,
    SphereGeometry,
    TextureLoader, TypedArray,
    Vector3
} from "three";
import {FBXLoader} from "three/examples/jsm/loaders/FBXLoader";
import {OBJLoader} from "three/examples/jsm/loaders/OBJLoader";
import {Loader} from "three/src/Three";
import {ColladaLoader} from "three/examples/jsm/loaders/ColladaLoader";
import {STLLoader} from "three/examples/jsm/loaders/STLLoader";
import {Object3D} from "three/src/core/Object3D";
import {AssetObject, Circle, Line, PlaneConfig, Rectangle, WaterConfig} from "../../../types/assets.ts";
import {ShadowType} from "../types/controller.ts";
import {MeshOrGroup, RenderedPlane, RenderedWater} from "../types/three.ts";
import {Water} from "three/examples/jsm/objects/Water2";

export const serverURL = '//localhost:3000/'

const isLocalFileExists = async (url: string) => {
    const response = await fetch(url, { method: 'HEAD' })
        .catch(error => {
            console.error('Error fetching the URL:', error);
        });

    return response && response.ok && response.headers.get('Content-Type') === "application/json";
};

const genericLoader = (file: File|string|Blob, modelLoader: Loader, assetId?:string) => {
    return new Promise(async resolve => {
        if (file) {
            modelLoader.crossOrigin = '';
            const exists = typeof file === "string" ? await isLocalFileExists(file) : true;
            if (!exists && assetId) {
                const response = await fetch(serverURL + 'asset?id=' + assetId,
                    {
                        method: 'GET'
                    }).catch((e) => {
                    console.error('Server couldn\'t fetch the asset: ', e);
                });
                if (response && response.ok) {
                    const asset: AssetObject|undefined = await response.json().catch(e => {
                        console.error('Failed to parse asset ', e);
                    });
                    if (asset && asset.path) {
                        file = asset.path
                    } else {
                        return resolve(null);
                    }
                } else {
                    return resolve(null);
                }
            }
            return modelLoader.load(
                typeof file === "string" ? file : URL.createObjectURL(file),
                resolve,
                undefined,
                () => {
                    console.error('Failed to load file ', typeof file === "string" ? file.substring(0, 20) : file);
                    resolve(null);
                });
        }
        return resolve(null);
    });
};

export const loadModel = {
    gltf: async (file: File|string, assetId?:string): Promise<GLTF | null> => {
        const object = await genericLoader(file, new GLTFLoader(), assetId);
        if (object) {
            return object as GLTF;
        }
        return null;
    },
    fbx: async (file: File|string, assetId?:string): Promise<Group<Object3DEventMap>|null> => {
        const object = await genericLoader(file, new FBXLoader(), assetId);
        if (object) {
            return object as Group<Object3DEventMap>;
        }
        return null;
    },
    obj: async (file: File|string, assetId?:string): Promise<Group<Object3DEventMap>|null> => {
        const object = await genericLoader(file, new OBJLoader(), assetId);
        if (object) {
            return object as Group<Object3DEventMap>;
        }
        return null;
    },
    collada: async (file: File|string, assetId?:string): Promise<Group<Object3DEventMap>|null> => {
        const object = await genericLoader(file, new ColladaLoader(), assetId);
        if (object) {
            return object as Group<Object3DEventMap>;
        }
        return null;
    },
    stl: async (file: File|string, assetId?:string): Promise<Mesh<BufferGeometry<NormalBufferAttributes>, MeshPhongMaterial, Object3DEventMap>|
        null> => {
        const geometry = await genericLoader(file, new STLLoader(), assetId);
        if (geometry) {
            const material = new MeshPhongMaterial({ color: 0xff9c7c, specular: 0x494949, shininess: 200 });
            return new Mesh(geometry as BufferGeometry, material);
        }
        return null;
    },
    items: async (objects: AssetObject[]): Promise<MeshOrGroup[]> => {
        const items: MeshOrGroup[] = [];
        for (let i = 0; i < objects.length; i++) {
            const mesh = await getMeshForItem(objects[i]);
            if (mesh) {
                items.push(mesh);
            }
        }
        return items;
    }
}

export const lookAtObject = (models: Object3D, camera: PerspectiveCamera): void => {
    const boundingBox = new THREE.Box3();
    boundingBox.setFromObject(models);
    const boundingBoxCenter = new THREE.Vector3();
    boundingBox.getCenter(boundingBoxCenter);
    const boundingBoxSize = new THREE.Vector3();
    boundingBox.getSize(boundingBoxSize);
    const boundingBoxDistance = boundingBoxSize.length();

    const cameraPosition = new THREE.Vector3();
    cameraPosition.copy(boundingBoxCenter);

    cameraPosition.z += boundingBoxDistance;
    camera.position.copy(cameraPosition);
    camera.lookAt(boundingBoxCenter);
}

export const loadTexture = (url: string): Promise<THREE.Texture> => {
    return new Promise(resolve => {
        const loader = new THREE.TextureLoader();
        loader.load(url,
            function (texture) {
                resolve(texture);
            });
    });
}

export const getGroundPlane = async (size: number, textureSrc?:string, heightMap?:string): Promise<RenderedPlane> => {
    const texture = await loadTexture(textureSrc || '/assets/textures/green-grass-textures.jpg');
    const heightMapTexture = heightMap ? await loadTexture(heightMap) : null;
    const heightImg = heightMapTexture ? heightMapTexture.image : null;

    const segments = Math.min(99, size - 1),
        cSize = segments + 1;
    const geometry = heightImg ?
        new THREE.PlaneGeometry(size, size, segments, segments) :
        new THREE.PlaneGeometry(size, size);
    const material = new THREE.MeshStandardMaterial({ color: 0xffff00, side: THREE.DoubleSide });


    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.offset.set(0, 0);
    const ratio = [Math.ceil(size / (texture.image.width || size)), Math.ceil(size / (texture.image.height || size))];
    console.log(ratio);
    texture.repeat.set(ratio[0] * 10, ratio[1] * 10);
    material.map = texture;
    material.needsUpdate = true;
    if (!heightImg) {
        // Ensure we have enough segments to procedurally displace later
        const segGeometry = new THREE.PlaneGeometry(size, size, segments, segments);
        const plane = new THREE.Mesh(segGeometry, material) as RenderedPlane;
        plane.receiveShadow = true;
        // Keep a consistent orientation with heightmap branch (flat horizontal plane)
        plane.rotation.set(-Math.PI / 2, 0, 0);
        plane.position.set(size / 2, -35, size / 2);
        plane.name = "plane";
        return plane;
    }

    const maxHeight = 100;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;

    canvas.width = cSize;
    canvas.height = cSize;

    // Draw the image onto the canvas
    context.drawImage(heightImg, 0, 0, cSize, cSize);
    const imageData = context.getImageData(0, 0, cSize, cSize).data;

    const vertices: TypedArray = geometry.attributes.position.array;

    // Adjust each vertex in the geometry
    for (let j = 0; j < cSize; j++) {
        for (let i = 0; i < cSize; i++) {
            const n = (j * cSize + i) * 4;
            const grayScale = imageData[n]; // Assuming the image is grayscale, we can just take the red channel
            // Scale the height based on your needs
            // Set the z position of the vertex

            const posIndex = (j * cSize + i) * 3;
            vertices[posIndex + 2] = (grayScale / 255) * maxHeight;
        }
    }
    // geometry.attributes.position.needsUpdate = true;

    geometry.computeVertexNormals(); // Optional: Compute normals for better lighting
    geometry.computeBoundingBox();
    const plane = new THREE.Mesh(geometry, material) as RenderedPlane;
    plane.position.set(size / 2, -35, size / 2);
    plane.receiveShadow = true;
    plane.rotation.set(-Math.PI / 2, 0, 0);
    plane.name = "plane";
    plane.heightMap = heightMap;
    return plane;
}

export const getWater = async (waterConfig: WaterConfig, planeSize = 100) => {
    const flowMap = await loadTexture(waterConfig.flowMap || '/assets/water/height.png');
    const normal0 = await loadTexture(waterConfig.normalMap0 || '/assets/water/normal0.jpg');
    const normal1 = await loadTexture(waterConfig.normalMap1 || '/assets/water/normal1.jpg');
    const waterGeometry = new THREE.PlaneGeometry(1000, 1000);

    const water = new Water(waterGeometry, {
        scale: 1,
        textureWidth: 1024,
        textureHeight: 1024,
        flowMap: flowMap,
        normalMap0: normal0,
        normalMap1: normal1
    });

    water.name = "water";
    water.position.set(planeSize / 2, -1, planeSize / 2);
    water.rotation.x = -Math.PI / 2;
    return water;
}

export const getMeshForItem = async (item: AssetObject): Promise<Mesh|Group|null> => {
    let model;

    let material;
    if (item.texture) {
        const textureLoader = new TextureLoader();
        const texture = textureLoader.load(
            item.texture
        );
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        material = new MeshStandardMaterial({
            map: texture,
        });
        material.needsUpdate = true;
    } else {
        material = new MeshStandardMaterial({ color: item.color ?
                new Color(item.color) : 0x000000 })
    }
    let geometry;
    let position1, position2;
    switch (item.type) {
        case "rect":
            const rect = item as Rectangle;
            geometry = new BoxGeometry(rect.w, Math.round((rect.w + rect.h) / 2), rect.h);
            break;
        case "circle":
            geometry = new SphereGeometry((item as Circle).radius, 32, 16);
            break;
        case "line":
            const line = item as Line;
            position1 = new Vector3(line.x1, 0, line.y1);
            position2 = new Vector3(line.x2, 0, line.y2);
            const height = position1.distanceTo(position2);
            geometry = new CylinderGeometry(5, 5, height, 32);
            break;
        case "model":
            if(!item.path) {
                return null;
            }
            if (item.path.endsWith(".gltf") || item.path.endsWith(".glb")) {
                const group = await loadModel.gltf(item.path, item.id);
                if (group) {
                    const model = group.scene;
                    const rect = item as Rectangle;
                    const rZ = rect.z || 0;
                    const rX = rect.x || 0;
                    const rY = rect.y || 0;
                    const rW = rect.w || 0;
                    const rH = rect.h || 0;
                    model.position.set(rX + rW / 2, rZ + Math.round((rW + rH) / 2) / 2,
                        rY + rH / 2);
                    return model;
                }
                return null;
            } else if (item.path.endsWith('.fbx')) {
                return await loadModel.fbx(item.path, item.id);
            } else if (item.path.endsWith('.obj')) {
                return await loadModel.obj(item.path, item.id);
            } else if (item.path.endsWith('.collada')) {
                return await loadModel.collada(item.path, item.id);
            } else if (item.path.endsWith('.stl')) {
                return await loadModel.stl(item.path, item.id);
            }
            return null;
        case "plane":
            const plane = item as PlaneConfig;
            return await getGroundPlane(plane.size || 1000, plane.texture, plane.heightMap) as RenderedPlane;
        case "water":
            return await getWater(item as WaterConfig, 1000) as RenderedWater;
    }
    model = new Mesh(geometry, material);
    model.castShadow = true; //default is false
    model.receiveShadow = false; //default
    // Position must be ZYX instead of ZXY
    if (model && position1 && position2) {
        const positionMid = new Vector3();
        positionMid.addVectors(position1, position2).multiplyScalar(0.5);
        model.position.copy(positionMid);
        const direction = new Vector3();
        direction.subVectors(position2, position1).normalize();

        const quaternion = new Quaternion();
        quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction);
        model.setRotationFromQuaternion(quaternion);
    } else if (model && item.type === "rect") {
        const rect = item as Rectangle;
        const z = rect.z || 0;
        model.position.set(rect.x + rect.w / 2, z + Math.round((rect.w + rect.h) / 2) / 2, rect.y + rect.h / 2);
    } else if (model && typeof item.x === 'number' && typeof item.y === "number") {
        model.position.set(item.x, item.z || 0, item.y);
    }
    return model;
};

export const getArrowHelper = (): Group => {
    const arrowGroup = new Group();
    arrowGroup.name = "arrows";
    const xAxisDirection = new Vector3(1, 0, 0);
    const yAxisDirection = new Vector3(0, 1, 0);
    const zAxisDirection = new Vector3(0, 0, 1);

    const origin = new Vector3(0, 0, 0);
    const length = 100;

    const xAxisArrow = new ArrowHelper(xAxisDirection, origin, length, 0xff0000);
    const yAxisArrow = new ArrowHelper(yAxisDirection, origin, length, 0x00ff00);
    const zAxisArrow = new ArrowHelper(zAxisDirection, origin, length, 0x0000ff);

    arrowGroup.add(xAxisArrow);
    arrowGroup.add(yAxisArrow);
    arrowGroup.add(zAxisArrow);

    return arrowGroup;
}


export const createShadowObject = async (reference: AssetObject): Promise<ShadowType|null> => {
    const config = {
        ...reference,
        color: "#3cffee",
    };
    switch (reference.type) {
        case "rect":
            (config as Rectangle).w = 5;
            (config as Rectangle).h = 5;
            break;
        case "circle":
            (config as Circle).radius = 5;
            break;
    }
    const shadowObject = await getMeshForItem(config) as ShadowType;
    if (shadowObject) {
        shadowObject.refType = reference.type;
        shadowObject.name = "shadowObject";
        if (shadowObject.material) {
            (shadowObject.material as THREE.MeshBasicMaterial).opacity = 0.5;
            (shadowObject.material as THREE.MeshBasicMaterial).needsUpdate = true;
        }
        shadowObject.position.y = -100;
        return shadowObject;
    }
    return null;
}

export const isCollisionDetected = (object1: THREE.Object3D, object2: THREE.Object3D) => {
    const box1 = new THREE.Box3().setFromObject(object1);
    const box2 = new THREE.Box3().setFromObject(object2);

    return box1.intersectsBox(box2);
}