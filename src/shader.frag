// boot-effect fragment shader. One full-screen pass renders every phase of the sequence.
//
// uMode selects the phase: 0 photo, 1 polar grid, 2 threshold, 3 mosaic, 4 blue, 5 ghost, 6 speckle.
// The aux texture (uAux) carries the analysis of the photo: R sky mask, G luma, B local contrast.
// Geometry of the grid phase is expressed in "reference pixels" of a 720px-wide frame (q = pixel / uScale).
precision highp float;
uniform sampler2D uPhoto,uAux,uText;
uniform vec2 uView,uPhotoSize,uCentre;
uniform vec3 uSkyColour;
uniform vec4 uRect,uGlow;
uniform float uReach,uInkScale,uScale,uSharpen,uChromaShift,uGrade,uGlowRings,uMode,uFrame;
uniform float uDiscRadius,uDiscFill,uOuterRings,uDialogReveal,uDialogFade,uThreshold,uSparks,uTextVisible;
const float PI=3.14159265;
const vec3 BLUE=vec3(0.008,0.18,0.82);
const vec3 LUM=vec3(0.299,0.587,0.114);

float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec3 grade(vec3 c,vec3 g,vec3 o){return clamp(c*g+o,0.,1.);}

// Catmull-Rom bicubic, 5 bilinear taps
vec3 texCR(vec2 uv){
  vec2 sp=uv*uPhotoSize;
  vec2 tp=floor(sp-0.5)+0.5;
  vec2 f=sp-tp;
  vec2 w0=f*(-0.5+f*(1.0-0.5*f));
  vec2 w1=1.0+f*f*(-2.5+1.5*f);
  vec2 w2=f*(0.5+f*(2.0-1.5*f));
  vec2 w3=f*f*(-0.5+0.5*f);
  vec2 w12=w1+w2;
  vec2 t=1./uPhotoSize;
  vec2 c12=(tp+w2/w12)*t;vec2 c0=(tp-1.)*t;vec2 c3=(tp+2.)*t;
  vec3 r=texture2D(uPhoto,vec2(c12.x,c0.y)).rgb*(w12.x*w0.y)
        +texture2D(uPhoto,vec2(c0.x,c12.y)).rgb*(w0.x*w12.y)
        +texture2D(uPhoto,c12).rgb*(w12.x*w12.y)
        +texture2D(uPhoto,vec2(c3.x,c12.y)).rgb*(w3.x*w12.y)
        +texture2D(uPhoto,vec2(c12.x,c3.y)).rgb*(w12.x*w3.y);
  float ws=w12.x*w0.y+w0.x*w12.y+w12.x*w12.y+w3.x*w12.y+w12.x*w3.y;
  return clamp(r/ws,0.,1.);
}
vec3 photoAt(vec2 uv){
  vec3 c=texCR(uv);
  if(uSharpen>0.){
    vec2 t=1./uPhotoSize;
    vec3 b=(texture2D(uPhoto,uv+vec2(t.x,0.)).rgb+texture2D(uPhoto,uv-vec2(t.x,0.)).rgb
           +texture2D(uPhoto,uv+vec2(0.,t.y)).rgb+texture2D(uPhoto,uv-vec2(0.,t.y)).rgb+c)/5.;
    c=clamp(c+uSharpen*(c-b),0.,1.);
  }
  return c;
}

vec3 dialog(float lu,float lv,float cw,float ch,float h){
  float bu=max(1.3,1./uScale)/cw,bv=max(1.3,1./uScale)/ch;
  vec3 c=vec3(0.97);
  if(lv<5.5/ch){c=mix(vec3(0.02,0.05,0.5),vec3(0.35,0.6,0.85),lu*0.8);}
  else{
    if(lv>0.46&&lv<0.58){
      float prog=0.12+0.8*fract(h*7.13);
      float seg=step(fract(lu*16.),0.7)*step(lu,prog)*step(0.06,lu);
      c=mix(vec3(0.84,0.85,0.9),vec3(0.25,0.62,0.88),seg);
    }
    float t1=step(0.26,lv)*step(lv,0.33)*step(lu,0.62)*step(0.06,lu)*step(0.3,fract(lu*34.));
    float t2=step(0.37,lv)*step(lv,0.43)*step(lu,0.46)*step(0.06,lu)*step(0.3,fract(lu*30.+h));
    float t3=step(0.72,lv)*step(lv,0.78)*step(lu,0.5)*step(0.06,lu)*step(0.3,fract(lu*28.));
    c=mix(c,vec3(0.42),max(t1,max(t2,t3))*0.9);
  }
  if(lu<bu||lu>1.-bu||lv>1.-bv||lv<bv*0.5) c=vec3(0.55,0.56,0.62);
  return c;
}

vec3 gridLayer(vec2 q){
  float aa=0.5/uScale;
  vec2 d=q-uCentre;float r=length(d);float tn=atan(d.y,d.x)/(2.*PI)+0.5;
  vec3 g=vec3(1.);
  float sp=2.*PI*r/144.;
  float w=max(0.575,0.5/uScale);
  float da=abs(fract(tn*144.+0.5)-0.5)*sp;
  float v=log(max(r,1.))/(2.*PI/144.);
  float dr=abs(fract(v+0.5)-0.5)*sp;
  float ln=max(1.-smoothstep(w-aa,w+aa,da),1.-smoothstep(w-aa,w+aa,dr))*smoothstep(3.,7.,sp)*smoothstep(2.,4.,sp*uScale);
  g=mix(g,vec3(0.58,0.62,0.74),ln*0.6);
  float wm=max(0.7,0.5/uScale);
  float dm=abs(fract((r-(uDiscRadius+2.))/21.6+0.5)-0.5)*21.6;
  float lm=(1.-smoothstep(wm-aa,wm+aa+0.4,dm))*step(uDiscRadius+1.,r)*(1.-smoothstep(260.,340.,r))*uOuterRings;
  g=mix(g,vec3(0.42,0.46,0.62),lm*0.5);
  if(uDialogReveal>0.&&r>186.){
    float wv=log(r/186.)/0.176;float k=floor(wv);float fv=fract(wv);
    float wu=tn*24.;float a=floor(wu);float fu=fract(wu);
    float h=hash(vec2(a,k));float h2=hash(vec2(k*7.3+1.,a*3.1+2.));
    float order=0.8*(1.-clamp((r-186.)/max(uReach-186.,60.),0.,1.))+0.2*h;
    float lu=(fu-0.07)/0.86,lv=(fv-0.10)/0.80;
    if(order<uDialogReveal&&h2>=uDialogFade&&lu>=0.&&lu<1.&&lv>=0.&&lv<1.){
      g=dialog(lu,lv,0.2618*r*0.86,0.1924*r*0.8,h);
    }
  }
  if(uGlow.a>0.){
    float glow=smoothstep(uDiscRadius+6.,uDiscRadius+12.,r)*(1.-smoothstep(uDiscRadius+22.,uDiscRadius+75.,r));
    float rings=step(0.5,0.5+0.5*cos((r-uDiscRadius)*0.21))*smoothstep(uDiscRadius+22.,uDiscRadius+32.,r)*(1.-smoothstep(uDiscRadius+80.,uDiscRadius+100.,r));
    g=mix(g,uGlow.rgb,uGlow.a*mix(glow,rings,uGlowRings));
  }
  return g;
}

void main(){
  vec2 px=vec2(gl_FragCoord.x,uView.y-gl_FragCoord.y);
  vec2 pr=px-uRect.xy;vec2 uv=pr/uRect.zw;vec2 q=pr/uScale;
  float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
  vec4 a=texture2D(uAux,clamp(uv,0.,1.));
  vec3 ph=mix(uSkyColour,photoAt(uv),inside);
  float sky=mix(1.,a.r,inside);
  float sd=a.b*inside/4.;
  float lumP=dot(ph,LUM);
  vec3 col=ph;
  if(uMode<1.5){
    if(uMode>0.5){
      float sp=uChromaShift*uScale/uRect.z;
      vec3 ps=vec3(texCR(uv+vec2(sp,0.)).r,ph.g,texCR(uv-vec2(sp,0.)).b);
      ps=mix(ph,ps,inside);
      float r=length(q-uCentre);
      float aaD=max(0.35,0.7/uScale);
      float outsideD=smoothstep(uDiscRadius-aaD,uDiscRadius+aaD,r);
      ps=mix(ps,grade(ps,vec3(0.55),vec3(13.,14.,20.)/255.),uGrade*(1.-sky));
      vec3 base=mix(ps,vec3(0.98,0.955,0.965),uDiscFill*sky);
      col=mix(base,gridLayer(q),sky*outsideD);
      if(uSparks>0.&&r<uDiscRadius-3.){
        vec2 cell=floor(q/5.);float hh=hash(cell+vec2(uFrame,uFrame*1.7));
        if(hh<uSparks*0.07)col=mix(col,(hash(cell)<0.5)?vec3(1.,1.,0.55):vec3(0.95,0.97,1.),0.9);
      }
    }
  } else if(uMode<2.5){
    col=mix(vec3(0.),vec3(1.-0.55*smoothstep(0.,0.5,lumP)),step(lumP,uThreshold));
  } else if(uMode<3.5){
    vec2 mq=(floor(q/9.)+0.5)*9.*uScale/uRect.zw;
    col=mix(uSkyColour,texture2D(uPhoto,clamp(mq,0.,1.)).rgb,inside);
  } else {
    if(uMode<4.5) col=BLUE;
    else if(uMode<5.5) col=mix(grade(ph,vec3(0.2,0.35,1.1),vec3(28.,28.,14.)/255.),BLUE,sky);
    else col=BLUE;
    if(uTextVisible>0.5) col=mix(col,vec3(1.),texture2D(uText,px/uView).a);
    if(uMode>5.5){
      float p=clamp(uThreshold*uInkScale*0.4*smoothstep(0.,0.07,sd)*(1.-sky),0.,0.97);
      float cellPx=max(1.,1.5*min(uScale,1.));
      col=mix(col,vec3(0.9,0.95,1.),step(hash(floor(px/cellPx)+vec2(uFrame*17.3,uFrame*5.1)),p));
    }
  }
  if(uMode<3.5){                                              // triangular-PDF dither, +-1 LSB: no banding in smooth gradients
    float dn=hash(gl_FragCoord.xy+91.7)+hash(gl_FragCoord.yx*1.37+47.3)-1.;
    col=clamp(col+dn/255.,0.,1.);
  }
  gl_FragColor=vec4(col,1.);
}
