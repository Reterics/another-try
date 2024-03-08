import * as THREE from 'three';
import {
    Box3,
    BufferGeometry,
    Camera,
    Group,
    Light,
    Mesh,
    MeshStandardMaterial,
    Object3D,
    Scene,
    ShaderMaterial, Vector3
} from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {ExtendedTriangle, MeshBVH, StaticGeometryGenerator} from 'three-mesh-bvh';
import {CapsuleInfo, SceneParams} from "../types/main.ts";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {Hero} from "../models/hero.ts";
import {Object3DEventMap} from "three/src/core/Object3D";
import {loadModel} from "../utils/model.ts";
import {ATMap, ATMapsObject} from "../../../types/map.ts";
import {RenderedPlane, TerrainEnvironment} from "../types/three.ts";
import {
    coordToCoordDiff,
    coordToString,
    getCoordNeighbours,
    vector3ToCoord
} from "../utils/math.ts";
import {ServerManager} from "./ServerManager.ts";
import {PlaneConfig} from "../../../types/assets.ts";
import {Coord} from "../types/math.ts";
// import {getCoordNeighbours} from "../utils/math.ts";

let tempVector = new THREE.Vector3();
let tempVector2 = new THREE.Vector3();
let tempBox = new THREE.Box3();
let tempMat = new THREE.Matrix4();
let tempSegment = new THREE.Line3();
// let playerVelocity = new THREE.Vector3();
const upVector = new THREE.Vector3( 0, 1, 0 );
//const direction = new THREE.Vector3();
const velocity = new THREE.Vector3();
let timeUntilSprintOptionDisables: Date | undefined | null;


interface toMergeType {
    [key: number]: (Mesh|Light|undefined)[]
}
interface toMergeTextureType {
    [key: number]: (MeshStandardMaterial|undefined)
}

/*function getAzimuthalAngle(controls) {
    return Math.atan2(controls.camera.rotation.x, controls.camera.rotation.z);
}*/
export class TerrainManager {
    protected collider: Mesh;
    protected environment: Group;
    protected environments: TerrainEnvironment[];

    params: SceneParams;
    protected scene: Scene;
    initMethod: Promise<TerrainManager>;
    private loaded = false;
    private controls: OrbitControls;
    playerIsOnGround = false;
    canJump = false;
    sprinting = false; // Temporary not available
    energy = 10;
    fwdPressed = false; bkdPressed = false; lftPressed = false; rgtPressed = false;
    private readonly energyNode: HTMLProgressElement | null;
    private map: ATMap;
    private maps: ATMapsObject;

    private _interval: NodeJS.Timeout | number | undefined;
    frequency = 5000;
    private player?: Mesh | Object3D;

    constructor(model: ATMap, scene: Scene, controls:OrbitControls, callback: Function) {
        this.scene = scene;
        this.controls = controls;
        this.environment = new THREE.Group();
        this.environments = [];
        this.collider = new THREE.Mesh();
        this.map = model;
        this.initMethod = this._loadMapItems(callback);

        this.energyNode = document.getElementById("HUD-energy") as HTMLProgressElement;

        this.params = {
            displayCollider: false,
            visualizeDepth: 10,
            gravity: - 30,
            playerSpeed: 10,
            physicsSteps: 5,  //5
            spawnCoordinates: [12, 36, 120] // X Y Z
        };
        this.maps = {};
        return this;
    }

    static CreateMap(map: ATMap, scene: Scene, controls:OrbitControls): Promise<TerrainManager> {
        return new Promise(resolve => {
            new TerrainManager(map, scene, controls, resolve);
        })
    }
    setSpawnCoordinates (x: number, y: number, z: number) {
        this.params.spawnCoordinates = [x, y, z];
    }

    updateMapTexture(map: TerrainEnvironment) {console.log(map);
        if (map.texture) {
            return map.texture;
        }

        const plane = map.environment.children
            .find(o => o.name === 'plane') as RenderedPlane | undefined;
        if (!plane) {
            return undefined;
        }
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d') as CanvasRenderingContext2D;
        const size = 100,
            maxHeight = 100;

        if (plane.heightMap) {
            map.texture = plane.heightMap;
            return map.texture;
        }

        const vertices = plane.geometry.attributes.position.array;
        if (!vertices) {
            return undefined;
        }


        canvas.width = size;
        canvas.height = size;

        for (let j = 0; j < size; j++) {
            for (let i = 0; i < size; i++) {
                const n = (j * size + i) * 3; // Adjusted index calculation for row-major order

                const raw =  vertices[n + 1];

                // This had a value between 0-255 where 0-90 is blue, and between 91-200 green, above 200 should be brown
                const hexValue = raw / maxHeight * 255;

                // Determine color based on hexValue
                let color;
                if (hexValue <= 20) {
                    // Blue for low elevations
                    color = `rgb(0, 0, ${255 - hexValue})`; // Darker blue for deeper
                } else if (hexValue <= 200) {
                    // Green for mid elevations
                    color = `rgb(0, ${255 - hexValue}, 0)`; // Darker green for higher
                } else {
                    // Brown for high elevations
                    color = `rgb(${hexValue}, ${42}, 0)`;
                }

                // Set color and draw pixel
                context.fillStyle = color;
                context.fillRect(i, j, 1, 1); // Draw a 1x1 rectangle at the (i, j) location
            }
        }
        map.texture = canvas.toDataURL();
        return map.texture;
    }

    async importEnvironment(map: ATMap, position?: Vector3): Promise<TerrainEnvironment> {
        const loadedTerrain = map.name ? this.environments.find(e => e.name === map.name) : undefined;
        if (map.name && loadedTerrain) {
            return loadedTerrain;
        }
        const terrainEnv: TerrainEnvironment = {
            name: map.name || 'unknown-position',
            environment: new THREE.Group(),
            shaders: [],
            texture: map.texture
        };

        // We should have a plane by default
        if (!map.items.find(m=>m.type === "plane")) {
            map.items.unshift({
                "type": "plane",
                "texture": "/assets/textures/green-grass-textures.jpg",
                "size": 1000
            } as PlaneConfig)
        }

        // visual geometry setup
        const toMerge:toMergeType = {};
        const toMergeTexture:toMergeTextureType = {};

        const items = await loadModel.items(map.items);

        const processObject = (c: Object3D<Object3DEventMap>|Mesh|Light|Camera) => {
            if (c instanceof Mesh && c.isMesh) {
                if (c.material instanceof ShaderMaterial) {
                    terrainEnv.shaders.push(c);
                } else if (c.material instanceof MeshStandardMaterial) {
                    const material = c.material;
                    let hex = material.color ? material.color.getHex() || 0 : 0;
                    if (material.map) {
                        hex = Number(hex.toString() + '999');
                        toMergeTexture[hex] = material;
                    }

                    if (!Array.isArray(toMerge[ hex ])) {
                        toMerge[ hex ] =  [];
                    }
                    toMerge[ hex ].push( c );
                } else {
                    console.warn('Unsupported material: ', c.material);
                }
            } else if (c instanceof Light && c.isLight) {
                // We always need to clone the light, otherwise it fails
                terrainEnv.shaders.push( c.clone(true) as Object3D);
            } else if(c instanceof Camera && c.isCamera) {
                this.setSpawnCoordinates(c.position.x, c.position.y, c.position.z);
            }
        };

        for (let i = 0; i < items.length; i++){
            const item = items[i];
            item.updateMatrixWorld( true );

            if (item instanceof THREE.Group) {
                item.traverse(processObject);
            } else {
                processObject(item);
            }
        }

        for ( const hex in toMerge ) {
            // @ts-ignore
            const arr = toMerge[ hex ];
            const visualGeometries: BufferGeometry[] = [];
            arr.forEach( (element) => {
                if (element) {
                    const mesh = element as Mesh;
                    const material = mesh.material as MeshStandardMaterial;
                    if (position) {
                        mesh.position.add(position);
                    }
                    if ( material.emissive &&  material.emissive.r !== 0 ) {
                        terrainEnv.environment.attach( mesh );
                    } else if(material.map) {
                        const geom = mesh.geometry.clone();
                        geom.applyMatrix4( mesh.matrixWorld );
                        const newMesh = new THREE.Mesh( geom, material );
                        newMesh.castShadow = true;
                        newMesh.receiveShadow = true;
                        newMesh.material.shadowSide = 2;
                        newMesh.material.side = THREE.DoubleSide;
                        newMesh.name = mesh.name;
                        if (newMesh.name === "plane") {
                            (newMesh as RenderedPlane).heightMap = (mesh as RenderedPlane).heightMap;
                        }
                        if (position) {
                            newMesh.position.add(position);
                        }
                        terrainEnv.environment.add( newMesh );

                    } else {
                        const geom = mesh.geometry.clone();
                        geom.applyMatrix4( mesh.matrixWorld );
                        visualGeometries.push( geom );
                    }
                }

            } );

            if ( visualGeometries.length ) {
                const newGeom = BufferGeometryUtils.mergeGeometries(visualGeometries);
                // BufferGeometryUtils.mergeBufferGeometries( visualGeometries ) ;
                if (newGeom) {
                    let material;
                    if (toMergeTexture[hex]) {
                        material = toMergeTexture[hex] as MeshStandardMaterial;
                    } else {
                        material = new THREE.MeshStandardMaterial( {
                            color: parseInt( hex )
                            , shadowSide: 2 } );
                    }
                    const newMesh = new THREE.Mesh( newGeom, material );
                    newMesh.castShadow = true;
                    newMesh.receiveShadow = true;
                    newMesh.material.shadowSide = 2;
                    newMesh.material.side = THREE.DoubleSide;
                    if (position) {
                        newMesh.position.add(position);
                    }
                    terrainEnv.environment.add( newMesh );
                } else {
                    console.error('Merging visual geometries failed');
                }
            } else {
                console.error('No visual geometries found')
            }
        }

        this.updateMapTexture(terrainEnv);
        return terrainEnv;
    }

    refreshCollider() {
        this.environment.clear();

        // Merge environment children
        this.environments.forEach(e => {
            e.environment.children.forEach(object=> {
                console.log(object.position);
                this.environment.children.push(object);
            });
        });
        this.environment.updateMatrixWorld( true );

        const staticGenerator = new StaticGeometryGenerator( this.environment );
        staticGenerator.attributes = [ 'position' ];

        const mergedGeometry = staticGenerator.generate();
        mergedGeometry.boundsTree = new MeshBVH( mergedGeometry );

        this.collider.clear();
        this.collider =  new THREE.Mesh( mergedGeometry );
        this.collider.name = 'collider';
        const colliderMaterial: MeshStandardMaterial = this.collider.material as MeshStandardMaterial;
        colliderMaterial.wireframe = true;
        colliderMaterial.opacity = 0.5;
        colliderMaterial.transparent = true;
        return this.collider;
    }

    async _loadMapItems(callback: Function|undefined): Promise<TerrainManager> {
        const terrain = await this.importEnvironment(this.map);
        if (terrain.texture && terrain.texture !== this.map.texture) {
            this.map.texture = terrain.texture;
        }
        this.environments.push(terrain);

        this.refreshCollider();

        this.loaded = true;
        if (typeof callback === 'function') {
            callback(this);
        }
        return this;
    }

    respawn(player: Mesh|Object3D) {
        this.player = player;
        player.position.set(
            this.params.spawnCoordinates[0],
            this.params.spawnCoordinates[1],
            this.params.spawnCoordinates[2]);

        this.controls.object
            .position
            .sub( player.position )
            .normalize()
            .multiplyScalar( 100)
            .add( player.position );

        velocity.set(0,0,0);

        this.controls.update();
    }
    initPlayerEvents() {
        window.addEventListener( 'keydown', e => {

            switch ( e.code ) {

                case 'KeyW':
                    if(!this.fwdPressed) {
                        const now = new Date()

                        if(timeUntilSprintOptionDisables != null && timeUntilSprintOptionDisables > now) {
                            this.sprinting = true; // Temporary not available
                        }

                        now.setSeconds(now.getSeconds() + 1)
                        timeUntilSprintOptionDisables = now
                    }
                    this.fwdPressed = true;

                    break;
                case 'KeyS': this.bkdPressed = true; break;
                case 'KeyD': this.rgtPressed = true; break;
                case 'KeyA': this.lftPressed = true; break;
                case 'Space':
                    // this.controls.camera.position.y = 10;
                    if ( this.playerIsOnGround && this.canJump) {
                        velocity.y = 10.0;
                        this.playerIsOnGround = false;
                    }
                    break;

            }

        });

        window.addEventListener( 'keyup', e => {
            switch ( e.code ) {
                case 'KeyW': this.fwdPressed = false; break;
                case 'KeyS': this.bkdPressed = false; break;
                case 'KeyD': this.rgtPressed = false; break;
                case 'KeyA': this.lftPressed = false; break;
            }
        });
    }

    async addToScene() {
        if (!this.loaded) {
            await this.initMethod;
        }
        if (this.collider && !this.scene.children.find(c=>c===this.collider)) {
            this.scene.add( this.collider );
            this.scene.add( this.environment );
            this.environments
                .flatMap((terrain)=>terrain.shaders)
                .forEach(mesh => this.scene.add(mesh));
        }
    }

    updatePlayer(delta:number, camera: THREE.PerspectiveCamera, hero: Hero) {
        const player = hero ? hero.getObject() : null;
        let moving = false;
        if (this.collider && camera && player) {
            this.collider.visible = this.params.displayCollider || false;

            if(this.sprinting) {
                if(this.energy > 0) {
                    velocity.z -= this.params.playerSpeed;
                    this.energy -= 3.00
                }
                else {
                    this.sprinting = false
                }
            }
            else {
                if(this.energy < 20) {
                    this.energy += 0.02
                }
            }

            if (this.energyNode) {
                this.energyNode.innerHTML = Math.round(this.energy).toString();
                this.energyNode.value = this.energy;
            }

            if ( this.playerIsOnGround ) {
                velocity.y = delta * this.params.gravity;
                //velocity.y = Math.max( 0, velocity.y );
                this.canJump = true;
            } else {
                velocity.y += delta * this.params.gravity;
            }


            player.position.addScaledVector( velocity, delta );

            const angle = this.controls.getAzimuthalAngle(); // Get Azimuth for OrbitControl
            tempVector.set(0,0,0);

            if (this.fwdPressed) {
                tempVector.z = -1;
            }

            if (this.bkdPressed) {
                tempVector.z = 1;
            }

            if (this.lftPressed) {
                tempVector.x = -1;
            }

            if (this.rgtPressed) {
                tempVector.x = 1;
            }

            tempVector.normalize();
            tempVector.applyAxisAngle(upVector, angle);

            if (this.fwdPressed || this.bkdPressed || this.lftPressed || this.rgtPressed) {
                player.position.addScaledVector( tempVector, this.params.playerSpeed * delta );
                player.lookAt(player.position.clone().add(tempVector));
                hero.changeAnimation('Walk');
                moving = true;
                // console.log(getCoordNeighbours([player.position.x, player.position.z, player.position.y], 100));
            } else {
                hero.changeAnimation(this.playerIsOnGround ? 'Idle' : 'Jump');
            }

            player.updateMatrixWorld();

            // adjust player position based on collisions
            // @ts-ignore
            const capsuleInfo: CapsuleInfo = player["capsuleInfo"] as CapsuleInfo;
            tempBox.makeEmpty();
            tempMat.copy( this.collider.matrixWorld ).invert();
            tempSegment.copy( capsuleInfo.segment );

            // get the position of the capsule in the local space of the collider
            tempSegment.start.applyMatrix4( player.matrixWorld ).applyMatrix4( tempMat );
            tempSegment.end.applyMatrix4( player.matrixWorld ).applyMatrix4( tempMat );

            // get the axis aligned bounding box of the capsule
            tempBox.expandByPoint( tempSegment.start );
            tempBox.expandByPoint( tempSegment.end );

            tempBox.min.addScalar( - capsuleInfo.radius );
            tempBox.max.addScalar( capsuleInfo.radius );

            if (this.collider.geometry.boundsTree) {
                this.collider.geometry.boundsTree.shapecast( {

                    intersectsBounds: (box: Box3) => box.intersectsBox( tempBox ),

                    intersectsTriangle: (triangle:ExtendedTriangle) => {

                        // check if the triangle is intersecting the capsule and adjust the
                        // capsule position if it is.
                        const triPoint = tempVector;
                        const capsulePoint = tempVector2;

                        const distance = triangle.closestPointToSegment( tempSegment, triPoint, capsulePoint );
                        if ( distance < capsuleInfo.radius ) {

                            const depth = capsuleInfo.radius - distance;
                            const direction = capsulePoint.sub( triPoint ).normalize();

                            tempSegment.start.addScaledVector( direction, depth );
                            tempSegment.end.addScaledVector( direction, depth );

                        }

                    }

                } );
            }

            // get the adjusted position of the capsule collider in world space after checking
            // triangle collisions and moving it. capsuleInfo.segment.start is assumed to be
            // the origin of the player model.
            const newPosition = tempVector;
            newPosition.copy( tempSegment.start ).applyMatrix4( this.collider.matrixWorld );

            // check how much the collider was moved
            const deltaVector = tempVector2;
            deltaVector.subVectors( newPosition, player.position );

            // if the player was primarily adjusted vertically we assume it's on something we should consider ground
            this.playerIsOnGround = deltaVector.y > Math.abs( delta * velocity.y * 0.25 );

            const offset = Math.max( 0.0, deltaVector.length() - 1e-5 );
            deltaVector.normalize().multiplyScalar( offset );

            // adjust the player model
            player.position.add( deltaVector );

            if ( ! this.playerIsOnGround ) {
                deltaVector.normalize();
                velocity.addScaledVector( deltaVector, - deltaVector.dot( velocity ) );
            } else {
                velocity.set( 0, 0, 0 );
            }

            // adjust the camera
            camera.position.sub( this.controls.target );
            this.controls.target.copy( player.position );
            camera.position.add( player.position );

            // if the player has fallen too far below the level reset their position to the start
            if ( player.position.y < - 500 ) {
                this.respawn(player);
                moving = false;
            }
            return moving;
        }
    }

    dispose() {
        this.environments
            .flatMap((terrain)=>terrain.shaders)
            .forEach(mesh => this.scene.remove(mesh));
        this.collider.clear();
        this.environment.clear();
        this.scene.remove(this.collider);
        this.scene.remove(this.environment);
        this.environments.length = 0;
    }

    async updateScene (selectedMap: ATMap): Promise<TerrainManager> {
        if (this.map.id !== selectedMap.id && this.collider) {
            this.dispose();

            this.map = selectedMap;
            return this._loadMapItems(undefined);
        }
        return this;
    }

    getBoundingBox() {
        return this.collider.geometry.boundingBox;
    }

    getMap() {
        return this.map;
    }


    async checkMaps (serverManager: ServerManager) {
        if(!this.player) {
            return;
        }
        const player = this.player;
        const loadedMaps = this.environments.map(m=>m.name);
        const availableMaps =
            getCoordNeighbours([player.position.x, player.position.z, player.position.y], 100)
                .map(m=> [m, coordToString(m)] as [Coord, string])
                .filter((m) => {
                    return !loadedMaps.includes(m[1]);
                });

        const nextMap = availableMaps.shift();

        if (!nextMap) {
            return;
        }
        console.log('Next map to load:', nextMap);
        if (this.maps[nextMap[1]] === undefined) {
            const map = await serverManager.get('map?id=' + nextMap[1]);
            if (map) {
                this.maps[nextMap[1]] = map as ATMap;
            } else {
                this.maps[nextMap[1]] = {
                    items: [
                        {
                            "type": "plane",
                            "texture": "/assets/textures/green-grass-textures.jpg",
                            "size": 1000
                        }
                    ],
                    id: nextMap[1],
                    name: nextMap[1],
                    author: ""
                } as ATMap
            }
            if (this.maps[nextMap[1]]) {
                const movePosition = coordToCoordDiff(nextMap[0], vector3ToCoord(player.position));
                console.log(movePosition);
                const terrain = await this.importEnvironment(this.maps[nextMap[1]] as ATMap,movePosition);
                if (terrain.texture && terrain.texture !== this.map.texture) {
                    this.map.texture = terrain.texture;
                }
                this.environments.push(terrain);

                this.refreshCollider();
                console.log('Map loaded');
            }
        } else {
            console.log('Map is already loaded');
        }
    }


    startJobs (serverManager: ServerManager) {
        if (this._interval) {
            clearTimeout(this._interval);
        }

        this._interval = setTimeout(async () => {
            await this.checkMaps.call(this, serverManager);
            this.startJobs.call(this, serverManager);
        }, this.frequency);
    }
}
