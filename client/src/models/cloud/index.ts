import {
    BoxGeometry,
    Color,
    DoubleSide,
    IUniform,
    Matrix4,
    Mesh,
    Object3DEventMap,
    Scene,
    ShaderMaterial,
    Vector3
} from "three";
import vertexShader from "./cloud.vert?raw";
import fragmentShader from "./cloud.frag?raw";

type CloudUniforms = Record<string, IUniform>;

export default class Clouds {
    private readonly scene: Scene;
    readonly material: ShaderMaterial;
    readonly mesh: Mesh<BoxGeometry, ShaderMaterial, Object3DEventMap>;
    private readonly uniforms: CloudUniforms;
    private readonly baseAltitude: number;
    private readonly volumeHeight: number;
    private elapsed = 0;

    constructor(scene: Scene) {
        this.scene = scene;
        const width = 10000;
        const depth = 10000;
        const height = 3800;
        const baseAltitude = 300;
        this.baseAltitude = baseAltitude;
        this.volumeHeight = height;

        const geometry = new BoxGeometry(width, height, depth, 1, 1, 1);
        const boundsMin = new Vector3(-width / 2, -height / 2, -depth / 2);
        const boundsMax = new Vector3(width / 2, height / 2, depth / 2);

        this.uniforms = {
            uTime: {value: 0},
            uSunDirection: {value: new Vector3(-0.2, 0.95, 0.35).normalize()},
            uSkyBottomColor: {value: new Color(0x90c3ff)},
            uSkyTopColor: {value: new Color(0xe4f3ff)},
            uCloudBaseColor: {value: new Color(0xcfd8e3)},
            uCloudHighlightColor: {value: new Color(0xffffff)},
            uBoundsMin: {value: boundsMin.clone()},
            uBoundsMax: {value: boundsMax.clone()},
            uWindDirection: {value: new Vector3(0.55, 0.0, 0.35).normalize()},
            uWindSpeed: {value: 18},
            uCoverage: {value: 0.65},
            uDensity: {value: 0.95},
            uNoiseScale: {value: 0.00025},
            uDetailScale: {value: 2.2},
            uDetailStrength: {value: 0.6},
            uPrimarySteps: {value: 40},
            uShadowSteps: {value: 8},
            uLightAbsorption: {value: 1.1},
            uAnvilBias: {value: 0.35},
            uEdgeFade: {value: 6000},
            uInverseModelMatrix: {value: new Matrix4()},
        } as CloudUniforms;

        this.material = new ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false,
            side: DoubleSide
        });

        this.mesh = new Mesh(geometry, this.material);
        this.mesh.name = 'cloud';
        this.mesh.position.set(0, this.baseAltitude + this.volumeHeight * 0.5, 0);
        this.mesh.frustumCulled = false;
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

    update(delta: number, followPosition?: Vector3) {
        if (!this.mesh) {
            return;
        }
        this.elapsed += delta;
        this.uniforms.uTime.value = this.elapsed;
        if (followPosition) {
            this.mesh.position.x = followPosition.x;
            this.mesh.position.z = followPosition.z;
            this.mesh.position.y = this.baseAltitude + this.volumeHeight * 0.5;
        }
        this.mesh.updateMatrixWorld(true);
        (this.uniforms.uInverseModelMatrix.value as Matrix4).copy(this.mesh.matrixWorld).invert();
    }

    destroy() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
        }
    }
}
