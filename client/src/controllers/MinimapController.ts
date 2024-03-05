import * as THREE from "three";
import {Euler, OrthographicCamera, Scene, Vector3, WebGLRenderer} from "three";
import {MinimapDimensions, MinimapInputArguments} from "../types/controller.ts";
import {EventManager} from "../lib/EventManager.ts";


export class MinimapController extends EventManager{
    private readonly scene: Scene;
    private readonly camera: OrthographicCamera;
    private renderer: WebGLRenderer;
    private dimensions: MinimapDimensions;
    private outer: HTMLDivElement;

    constructor({boundingBox, texture, target}: MinimapInputArguments) {
        super();

        this.outer = target || this.renderHTML();
        const minimapCanvas = this.outer.querySelector('canvas');
        if (!minimapCanvas) {
            throw Error('Target Element must have a canvas to render');
        }

        const mapTexture = new THREE.TextureLoader().load(texture);
        const material = new THREE.SpriteMaterial({ map: mapTexture, color: 0xffffff });
        const sprite = new THREE.Sprite(material);
        sprite.position.set(0,0,0);
        this.scene = new THREE.Scene();
        this.scene.add(sprite);

        this.dimensions = {
            left: boundingBox ? boundingBox.min.x : minimapCanvas.width / -2,
            right: boundingBox ? boundingBox.max.x : minimapCanvas.width / 2,
            top: boundingBox ? boundingBox.max.z : minimapCanvas.height / 2,
            bottom: boundingBox ? boundingBox.min.z : minimapCanvas.height / -2,
            width: boundingBox ? boundingBox.max.x - boundingBox.min.x : minimapCanvas.width,
            height: boundingBox ? boundingBox.max.z - boundingBox.min.z : minimapCanvas.height
        };

        this.camera = new THREE.OrthographicCamera(
            -this.dimensions.right, // left
            -this.dimensions.left, // right
            this.dimensions.top, // top
            this.dimensions.bottom, // bottom
            1, // near
            2000 // far
        );
        this.camera.zoom = 1;

        this.renderer = new THREE.WebGLRenderer({ canvas: minimapCanvas });
        //this.renderer.setSize(this.dimensions.width, this.dimensions.height);
        sprite.scale.set(this.dimensions.width, this.dimensions.height, 1);
    }
    
    update(position?: Vector3, rotation?: Euler) {
        if (position) {
            //const vector2D = position.clone().project(this.camera); // Assuming `camera` is your orthographic camera
            this.camera.position.set(position.x, -position.z, -150);
            this.camera.lookAt(position.x, -position.z, 0);
        }
        if (rotation) {

        }
        this.camera.updateProjectionMatrix();
        this.renderer.render(this.scene, this.camera);
    }

    zoom (delta: number) {
        if (delta < 0) {
            if (0.11 < this.camera.zoom && this.camera.zoom <= 1) {
                this.camera.zoom -= 0.1;
            } else if (this.camera.zoom > 1){
                this.camera.zoom += delta;
            }
        } else {
            if (0.1 <= this.camera.zoom && this.camera.zoom < 1) {
                this.camera.zoom += 0.1;
            } else {
                this.camera.zoom += delta;
            }
        }
        this.camera.updateProjectionMatrix();
    }

    protected renderHTML() {
        if(this.outer) {
            return this.outer;
        }
        const outer = document.createElement('div');
        outer.classList.add('minimap-outer');

        const map = document.createElement('div');
        map.classList.add('map');
        const canvas = document.createElement('canvas');
        canvas.classList.add('minimap');

        const controllers = document.createElement('div');
        controllers.classList.add('controllers');

        const zoomIn = document.createElement('button');
        zoomIn.innerHTML = '+';
        zoomIn.classList.add('zoom');
        zoomIn.classList.add('zoom-in');
        zoomIn.onclick = () => {
            this.zoom(1);
            this.emit('zoom', 1);
        };
        const zoomOut = document.createElement('button');
        zoomOut.innerHTML = '-';
        zoomOut.classList.add('zoom');
        zoomOut.classList.add('zoom-out');
        zoomOut.onclick = () => {
            this.zoom(-1);
            this.emit('zoom', -1);
        };

        map.appendChild(canvas);
        controllers.appendChild(zoomIn);
        controllers.appendChild(zoomOut);


        outer.appendChild(map);
        outer.appendChild(controllers);
        this.outer = outer;
        document.body.appendChild(this.outer);
        return outer;
    }
}