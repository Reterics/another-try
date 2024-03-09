import {
    BufferGeometry, IUniform,
    Mesh,
    NormalBufferAttributes,
    Object3DEventMap,
    Scene,
    ShaderMaterial,
    SRGBColorSpace, Vector3
} from "three";
import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils";
import vertexShader from "./cloud.vert?raw";
import fragmentShader from "./cloud.frag?raw";
import {randInt} from "three/src/math/MathUtils";

export default class Clouds {
    scene: Scene;
    readonly material: ShaderMaterial;
    mesh: Mesh<BufferGeometry<NormalBufferAttributes>, ShaderMaterial, Object3DEventMap>;
    constructor(scene: Scene) {
        this.scene = scene;
        const cloudTexture = '/assets/textures/cloud-texture.png';
        const texture =  (new THREE.TextureLoader()).load(cloudTexture, t=> {
            t.colorSpace = SRGBColorSpace;
        });

        texture.magFilter = 1006;
        texture.minFilter = 1006;

        const fog = new THREE.Fog( 0x4584b4, 0, 3000 );
        //scene.fog = fog
        this.material = new THREE.ShaderMaterial( {

            uniforms: {

                "map": { type: "t", value: texture } as IUniform,
                "fogColor" : { type: "c", value: fog.color } as IUniform,
                "fogNear" : { type: "f", value: fog.near } as IUniform,
                "fogFar" : { type: "f", value: fog.far } as IUniform,

            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            depthWrite: false,
            //depthTest: false,
            transparent: true,
        } );

        const planeGeo = new THREE.PlaneGeometry( 64, 64 )
        const planeObj = new THREE.Object3D()
        const center = new Vector3(0,0,0);
        const geometries = []

        for ( let i = 0; i < 4000; i++ ) {

            planeObj.position.x = randInt(-2000, 3000);
            planeObj.position.y = randInt(100, 200);
            planeObj.position.z = randInt(-2000, 3000);
            planeObj.rotation.y = Math.random() * Math.PI;
            planeObj.lookAt(center)
            planeObj.scale.x = planeObj.scale.y = Math.random() * Math.random() * 1.5 + 0.5;
            planeObj.updateMatrix()

            const clonedPlaneGeo = planeGeo.clone();
            clonedPlaneGeo.applyMatrix4(planeObj.matrix);

            geometries.push(clonedPlaneGeo)

        }
        const planeGeos = mergeGeometries(geometries)

        const planesMesh = new THREE.Mesh(planeGeos, this.material)
        //planesMesh.renderOrder = 2
        planesMesh.position.y = 300;

        this.mesh = planesMesh;
    }

    getFromScene() {
        return this.scene.children.filter(mesh => mesh.name === 'cloud');
    }

    addToScene() {
        const clouds = this.getFromScene();
        if (clouds && clouds.length) {
            clouds.forEach(cloud=>this.scene.remove(cloud));
        }

        this.scene.add(this.mesh);
    }

    destroy() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
        }
    }
}
