import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {ExtendedTriangle, MeshBVH, StaticGeometryGenerator} from 'three-mesh-bvh';
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
    ShaderMaterial
} from "three";
import {CapsuleInfo, SceneParams} from "../types/main.ts";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {Hero} from "../models/hero.ts";
import {Object3DEventMap} from "three/src/core/Object3D";
import {loadModel} from "../utils/model.ts";
import {ATMap} from "../../../types/map.ts";
import {TerrainEnvironment} from "../types/three.ts";
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

    async importEnvironment(map: ATMap): Promise<TerrainEnvironment> {
        const loadedTerrain = map.name ? this.environments.find(e => e.name === map.name) : undefined;
        if (map.name && loadedTerrain) {
            return loadedTerrain;
        }
        const terrainEnv: TerrainEnvironment = {
            name: map.name || 'unknown-position',
            environment: new THREE.Group(),
            shaders: []
        };

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

                    terrainEnv.environment.add( newMesh );
                } else {
                    console.error('Merging visual geometries failed');
                }
            } else {
                console.error('No visual geometries found')
            }
        }
        return terrainEnv;
    }

    refreshCollider() {
        this.environment.clear();

        // Merge environment children
        this.environments.forEach(e => {
            e.environment.children.forEach(object=> {
                this.environment.children.push(object);
            });
        });

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
        this.environments.push(terrain);

        this.refreshCollider();

        this.loaded = true;
        if (typeof callback === 'function') {
            callback(this);
        }
        return this;
    }

    respawn(player: Mesh|Object3D) {
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
}
