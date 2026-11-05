// Pitch shifter (phase vocoder, after S. M. Bernsee's smbPitchShift). Shifts pitch without changing speed.
class PitchShift extends AudioWorkletProcessor{
 static get parameterDescriptors(){return [{name:'pitch',defaultValue:1,minValue:0.25,maxValue:4}]}
 constructor(){super();const N=2048,os=4;this.N=N;this.os=os;this.step=N/os;this.lat=N-this.step;this.h=N/2;
  this.win=new Float32Array(N);for(let k=0;k<N;k++)this.win[k]=-0.5*Math.cos(2*Math.PI*k/N)+0.5;
  this.re=new Float32Array(N);this.im=new Float32Array(N);this.aM=new Float32Array(this.h+1);this.aF=new Float32Array(this.h+1);this.sM=new Float32Array(this.h+1);this.sF=new Float32Array(this.h+1);
  this.st=[0,1].map(()=>({inF:new Float32Array(N),outF:new Float32Array(N),acc:new Float32Array(2*N),lp:new Float32Array(this.h+1),sp:new Float32Array(this.h+1),rv:this.lat}));
  // bit reversal + twiddles
  this.rev=new Uint32Array(N);const bits=Math.log2(N);for(let i=0;i<N;i++){let x=i,r=0;for(let b=0;b<bits;b++){r=(r<<1)|(x&1);x>>=1}this.rev[i]=r}
  this.cs=new Float32Array(N/2);this.sn=new Float32Array(N/2);for(let i=0;i<N/2;i++){this.cs[i]=Math.cos(2*Math.PI*i/N);this.sn[i]=Math.sin(2*Math.PI*i/N)}}
 fft(re,im,inv){const N=this.N,rv=this.rev;for(let i=0;i<N;i++){const j=rv[i];if(j>i){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}
  for(let size=2;size<=N;size<<=1){const half=size>>1,stp=N/size;for(let i=0;i<N;i+=size)for(let j=0;j<half;j++){const k=j*stp,wr=this.cs[k],wi=inv?this.sn[k]:-this.sn[k],a=i+j,b=a+half;
   const tr=re[b]*wr-im[b]*wi,ti=re[b]*wi+im[b]*wr;re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti}}}
 frame(s,p){const {N,os,step,lat,h,win,re,im,aM,aF,sM,sF}=this,exp=2*Math.PI*step/N,fpb=sampleRate/N;
  for(let k=0;k<N;k++){re[k]=s.inF[k]*win[k];im[k]=0}this.fft(re,im,false);
  for(let k=0;k<=h;k++){const mag=2*Math.sqrt(re[k]*re[k]+im[k]*im[k]),ph=Math.atan2(im[k],re[k]);let t=ph-s.lp[k];s.lp[k]=ph;t-=k*exp;let q=Math.trunc(t/Math.PI);if(q>=0)q+=q&1;else q-=q&1;t-=Math.PI*q;t=os*t/(2*Math.PI);aM[k]=mag;aF[k]=k*fpb+t*fpb}
  sM.fill(0);sF.fill(0);for(let k=0;k<=h;k++){const ix=Math.floor(k*p);if(ix<=h){sM[ix]+=aM[k];sF[ix]=aF[k]*p}}
  for(let k=0;k<=h;k++){let t=(sF[k]-k*fpb)/fpb;t=2*Math.PI*t/os+k*exp;s.sp[k]+=t;const ph=s.sp[k];re[k]=sM[k]*Math.cos(ph);im[k]=sM[k]*Math.sin(ph)}
  for(let k=h+1;k<N;k++){re[k]=0;im[k]=0}this.fft(re,im,true);
  for(let k=0;k<N;k++)s.acc[k]+=2*win[k]*re[k]/(h*os);
  for(let k=0;k<step;k++)s.outF[k]=s.acc[k];s.acc.copyWithin(0,step,2*N);s.acc.fill(0,2*N-step);
  for(let k=0;k<lat;k++)s.inF[k]=s.inF[k+step]}
 process(ins,outs,par){const inp=ins[0],out=outs[0];if(!inp||!inp.length){return true}const p=par.pitch[0];
  for(let c=0;c<out.length;c++){const x=inp[Math.min(c,inp.length-1)],y=out[c];
   if(Math.abs(p-1)<1e-4){y.set(x);continue}const s=this.st[c]||this.st[0];
   for(let i=0;i<x.length;i++){s.inF[s.rv]=x[i];y[i]=s.outF[s.rv-this.lat];s.rv++;if(s.rv>=this.N){s.rv=this.lat;this.frame(s,p)}}}
  return true}}
registerProcessor('pitch-shift',PitchShift);
