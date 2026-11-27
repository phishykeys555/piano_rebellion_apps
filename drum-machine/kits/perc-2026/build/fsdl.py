import sys,re,subprocess,time,json,os,html,urllib.parse
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
def get(url):
    for k in range(4):
        r=subprocess.run(['curl','-sS','-m','40','-A',UA,url],capture_output=True)
        if len(r.stdout)>2000: return r.stdout.decode('utf8','replace')
        time.sleep(3+3*k)
    return ''
def search(q,f,pages):
    out={}
    for p in range(1,pages+1):
        u="https://freesound.org/search/?"+urllib.parse.urlencode({'q':q,'f':f,'g':'','page':p})
        t=get(u)
        # each result block: find sound link + preview
        items=re.findall(r'data-mp3="(https://cdn\.freesound\.org/previews/\d+/(\d+)_(\d+)-lq\.mp3)"',t)
        titles=dict((m[1],(m[0],html.unescape(m[2]))) for m in re.findall(r'href="/people/([^/"]+)/sounds/(\d+)/"[^>]*title="([^"]*)"',t))
        n0=len(out)
        for url,sid,uid in items:
            if sid in titles: out[sid]=dict(id=sid,user=titles[sid][0],title=titles[sid][1],uid=uid)
        if len(out)==n0: break
        time.sleep(1.2)
    return out
def lic(user,sid):
    t=get(f"https://freesound.org/people/{user}/sounds/{sid}/")
    l=sorted(set(re.findall(r'creativecommons\.org/(?:licenses|publicdomain)/[a-z/0-9.\-]+',t)))
    return l
if __name__=='__main__':
    dest,q,f,pages=sys.argv[1],sys.argv[2],sys.argv[3],int(sys.argv[4])
    pat=re.compile(sys.argv[5]) if len(sys.argv)>5 else None
    os.makedirs(dest,exist_ok=True)
    res=search(q,f,pages)
    meta=[]
    for sid,d in sorted(res.items()):
        if pat and not pat.search(d['title']): continue
        d['license']=lic(d['user'],sid); time.sleep(1.0)
        fn=re.sub(r'[^A-Za-z0-9_.-]+','_',d['title'])
        fn=f"{sid}__{re.sub(chr(46)+'(aif|aiff|wav|flac|mp3|ogg|m4a)$','',fn,flags=re.I)}.ogg"
        d['file']=fn; d['preview']=f"https://cdn.freesound.org/previews/{int(sid)//1000}/{sid}_{d['uid']}-hq.ogg"
        d['page']=f"https://freesound.org/people/{d['user']}/sounds/{sid}/"
        subprocess.run(['curl','-sS','-m','60','-A',UA,'-o',os.path.join(dest,fn),d['preview']])
        meta.append(d); print(sid,d['user'],d['title'],d['license'],os.path.getsize(os.path.join(dest,fn)),flush=True)
    json.dump(meta,open(os.path.join(dest,'_meta.json'),'w'),indent=1)
