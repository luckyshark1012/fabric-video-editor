import { makeAutoObservable } from 'mobx';
import { fabric } from 'fabric';
import { getUid, isHtmlImageElement, isHtmlVideoElement } from '@/utils';
import anime from 'animejs';

export type EditorElementBase<T extends string, P> = {
  readonly id: string;
  fabricObject?: fabric.Object;
  name: string;
  readonly type: T;
  placement: Placement;
  timeFrame: TimeFrame;
  properties: P;
};
export type VideoEditorElement = EditorElementBase<
  "video",
  { src: string; elementId: string; imageObject?: fabric.Image }
>;
export type ImageEditorElement = EditorElementBase<"image", { src: string, elementId:string, imageObject?:fabric.Object }>;
export type TextEditorElement = EditorElementBase<"text", { text: string }>;


export type EditorElement =
  | VideoEditorElement
  | ImageEditorElement
  | TextEditorElement


export type Placement = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
};

export type TimeFrame = {
  start: number;
  end: number;
};

export type AnimationKeyFrame = {
  id: string;
  time: number;
  placement: Placement;
};

export type Animation = {
  id: string;
  targetId: string;
  endTime: number;
  easing: 'linear';
  targetProperty: keyof fabric.Object;
  targetValue: number;
  delay? : number;
}

export type MenuOption = 'Video' | 'Text' | 'Image' | 'Export' | 'Animation';


export class Store {
  canvas: fabric.Canvas | null 

  selectedMenuOption: MenuOption;
  videos: string[] 
  images: string[] 
  editorElements: EditorElement[] 
  maxTime: number 
  animations: Animation[]
  animationTimeLine: anime.AnimeTimelineInstance;
  playing: boolean;

  currentKeyFrame:number;
  fps:number;

  constructor() {
    this.canvas = null;
    this.videos = [];
    this.images = [];
    this.editorElements = [];
    this.maxTime = 30 * 1000;
    this.playing = false;
    this.currentKeyFrame = 0;
    this.fps = 60;
    this.animations = [];
    this.animationTimeLine = anime.timeline();
    this.selectedMenuOption = 'Video';
    makeAutoObservable(this);
  }

  get currentTimeInMs(){
    return this.currentKeyFrame * 1000 / this.fps;
  }

  setCurrentTimeInMs(time:number){
    this.currentKeyFrame = Math.floor(time /1000 * this.fps);
  }

  setSelectedMenuOption(selectedMenuOption: MenuOption) {
    this.selectedMenuOption = selectedMenuOption;
  }

  setCanvas(canvas: fabric.Canvas | null) {
    this.canvas = canvas;
  }

  setVideos(videos: string[]) {
    this.videos = videos;
  }

  addVideoResource(video: string) {
    this.videos = [...this.videos, video];
  }
  addImageResource(image: string) {
    this.images = [...this.images, image];
  }

  addAnimation(animation: Animation) {
    this.animations = [...this.animations, animation];
    this.refreshAnimations();
  }

  refreshAnimations(){
    this.animations.sort((a,b) => a.endTime - b.endTime);
    anime.remove(this.animationTimeLine);
    this.animationTimeLine = anime.timeline({
      duration: this.maxTime,
      autoplay: false,
    });
    for(let i = 0; i < this.animations.length; i++){
      const animation = this.animations[i];
      const editorElement = this.editorElements.find((element) => element.id === animation.targetId);
      const lastAnimationWithSameTarget = this.animations.slice(0,i).reverse().find((anim) => anim.targetId === animation.targetId);
      let proprtyStartValue = 0;
      let startTime = 0;
      if(lastAnimationWithSameTarget){
        proprtyStartValue = lastAnimationWithSameTarget.targetValue;
        startTime = lastAnimationWithSameTarget.endTime;
      }

      const fabricObject = editorElement?.fabricObject;
      if(!editorElement || !fabricObject){
        continue;
      }
      this.animationTimeLine.add({
        targets: fabricObject,
        [animation.targetProperty]: [proprtyStartValue,animation.targetValue],
        duration: animation.endTime - startTime,
        easing: animation.easing,
      },startTime);

    }
  }
  removeAnimation(id: string) {
    this.animations = this.animations.filter(
      (animation) => animation.id !== id
    );
    this.refreshAnimations();
  }



  setEditorElements(editorElements: EditorElement[]) {
    this.editorElements = editorElements;
  }

  updateEditorElement(editorElement: EditorElement) {
    this.editorElements = this.editorElements.map((element) =>
      element.id === editorElement.id ? editorElement : element
    );
  }
  updateEditorElementTimeFrame(editorElement: EditorElement, timeFrame: Partial<TimeFrame>) {
    if(timeFrame.start!=undefined && timeFrame.start < 0){
      timeFrame.start = 0;
    }
    if(timeFrame.end!=undefined && timeFrame.end > this.maxTime){
      timeFrame.end = this.maxTime;
    }
    const newEditorElement = {
      ...editorElement,
      timeFrame: {
        ...editorElement.timeFrame,
        ...timeFrame,
      }
    }
    this.updateVideoElements();
    this.updateEditorElement(newEditorElement);
  }


  addEditorElement(editorElement: EditorElement) {
    this.editorElements.push(editorElement);
  }

  removeEditorElement(id: string) {
    this.editorElements = this.editorElements.filter(
      (editorElement) => editorElement.id !== id
    );
  }

  setMaxTime(maxTime: number) {
    this.maxTime = maxTime;
  }


  setPlaying(playing: boolean) {
    this.playing = playing;
    this.updateVideoElements();
    if(playing){
      this.startedTime = Date.now();
      this.startedTimePlay = this.currentTimeInMs
      requestAnimationFrame(()=>{
        this.playFrames();
      });
    }
  }

  startedTime = 0;
  startedTimePlay = 0;

  playFrames(){
    if(!this.playing){
      return;
    }
    const elapsedTime = Date.now() - this.startedTime;
    const newTime = this.startedTimePlay+ elapsedTime;
    this.updateTimeTo(newTime);
    if(newTime > this.maxTime){
      this.currentKeyFrame = 0;
      this.setPlaying(false);
    }else{
      requestAnimationFrame(()=>{
        this.playFrames();
      });
    }
  }
  updateTimeTo(newTime:number){
    this.setCurrentTimeInMs(newTime);
    this.animationTimeLine.seek(newTime);
    this.editorElements.forEach(
      e=> {
        if(!e.fabricObject) return;
        e.fabricObject.opacity = e.timeFrame.start <= newTime && e.timeFrame.end >= newTime ? 1 : 0;
      }
    )
  }

  handleSeek(seek: number) {
    if(this.playing){
      this.setPlaying(false);
    }
    this.updateTimeTo(seek);
    this.updateVideoElements();
  }

  addVideo(index:number) {
    const videoElement = document.getElementById(`video-${index}`)
    if(!isHtmlVideoElement(videoElement)){
      return;
    }
    const videoDurationMs = videoElement.duration * 1000;
    const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
    const id = getUid();
    this.addEditorElement(
      {
        id,
        name: `Media(video) ${index + 1}`,
        type: "video",
        placement: {
          x: 0,
          y: 0,
          width: 100 * aspectRatio,
          height: 100,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        timeFrame: {
          start: 0,
          end: videoDurationMs,
        },
        properties: {
          elementId: `video-${id}`,
          src: videoElement.src,
        },
      },
    );
  }

  addImage(index:number){
    const imageElement = document.getElementById(`image-${index}`)
    if(!isHtmlImageElement(imageElement)){
      return;
    }
    const aspectRatio = imageElement.naturalWidth / imageElement.naturalHeight;
    const id = getUid();
    this.addEditorElement(
      {
        id,
        name: `Media(image) ${index + 1}`,
        type: "image",
        placement: {
          x: 0,
          y: 0,
          width: 100 * aspectRatio,
          height: 100,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        timeFrame: {
          start: 0,
          end: this.maxTime,
        },
        properties: {
          elementId: `image-${id}`,
          src: imageElement.src,
        },
      },
    );
  }
  addText() {
    const id = getUid();
    const index = this.editorElements.length;
    this.addEditorElement(
      {
        id,
        name: `Text ${index + 1}`,
        type: "text",
        placement: {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        timeFrame: {
          start: 0,
          end: this.maxTime,
        },
        properties: {
          text: "Text",
        },
      },
    );
  } 

  updateVideoElements(){
    this.editorElements.filter(
      (element): element is VideoEditorElement =>
        element.type === "video"
    )
    .forEach((element) => {
      const video = document.getElementById(element.properties.elementId);
      if (isHtmlVideoElement(video)) {
        const videoTime = (this.currentTimeInMs - element.timeFrame.start) / 1000;
        video.currentTime = videoTime;
        if(this.playing){
          video.play();
        }else {
          video.pause();
        }
      }
    })
  }
}
