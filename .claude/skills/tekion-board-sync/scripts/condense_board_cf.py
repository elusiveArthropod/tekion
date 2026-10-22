#!/usr/bin/env python3
"""Condense saved fetch_issues pages into one line per issue WITH custom fields.

Usage: python3 -I condense_board_cf.py <page1.txt> [...] > board-cf.txt

Line: KEY status pri type|module|env|devcat|category | assignees | links-count | title
Also writes board-cf.json next to the first input: per key {id, version, statusId,
statusName, priority, assignees, cf:{Type,Module,Environment,DevCategory,Category,Reporter}, links}.
Option labels come from the ids table below (fetch_custom_fields to refresh).
"""
import datetime, json, os, sys

OPT = {
 # Type
 "e_1ba00243fb3725d59cae62a3":"Feature","e_d51dc5283d6365c312c865cf":"Bug","e_feec88a4ec095231f7b1e3a2":"Improvement","e_b11aff7558c171f61b6bb79f":"Task",
 # Module
 "e_0574685aa63b7e2a8401d3ce":"Application","e_f4284fc0c502f93b6594a3be":"Automation","e_55f453730c2a50931496b1bf":"Platform","e_e29a338651389353cfe79ec6":"Connector","e_4cf07e73022c6c45899db345":"Agents","e_1ab2143af91e6c20c0119f8a":"Changeset","e_b00965d1e00892b17fa6e134":"API Group","e_ba33aa364f0eb40a6f7a8b7a":"Object Manager","e_b2def32365a01523da358b96":"Infra","e_24dd6e0dfcbdf7379f3516aa":"Pipeline","e_f67de52242bf4cf3ed74e9bd":"Product",
 # Environment
 "e_0dbc627df3af346cbca526d9":"Prod","e_dc095f8dfc61546e75d777c2":"PreProd","e_86e9f37ce6a8a787521b9d4c":"InternalUA",
 # Customers
 "e_f72dffd52e1f13acbf28e22d":"Tekion",
 # Dev Category
 "e_67bbbf4d8a30491460ce98d5":"UI","e_4b70001e6e5e679dd55240f3":"BE","e_6f2b3865d64afedcff6ba220":"UI+BE","e_e638e7aa8cdd0e5721cb2c8b":"Config","e_1932197870cc34fa885c1b8f":"Infra","e_d6dcb7869e99f35f39fdceb3":"QA","e_d9971c0d605ae1ab79c4a688":"Design","e_b9053034eac409bb1210452b":"Product","e_d941f82bdd22e71df40bdf78":"Connector","e_ad0c8497211a883f3cc00bb5":"DevOps",
 # Category
 "e_8287967c8ff5bb25ef403ef3":"QA Issue","e_0762e1ba05df03819188ee0a":"Blocker","e_2b8d0613a6c7d1b44d12efb7":"Config Tasks","e_bbe2be70e364626490b3c5f4":"Indexing","e_0540f818b1353921fc8e4f01":"Answer Retrieval","e_600d5b16c5aa0f0b8e165f9c":"Knowledge Indexing","e_c6567edc0cd37fa3882780e8":"Model Issue","e_c94172e52b162b581cecf9a5":"New Connector","e_428e5cf0ea86b9383f242b01":"23rdSeptBulkSelect","e_f62ddf735df64be9ea6181d1":"QA","e_b7a19e84d075f532ad5f5c0d":"1st Oct","e_3dec25f647caca6a966ca321":"Resiliency","e_f816e83bfad5117edddc6189":"Review Needed","e_543594aa3c44cf9d85ca6577":"Data Correctness","e_8f170e91b28603421322ae1b":"RCA Review","e_9be3a329a09b9c72824448e7":"Monday Migrated",
}
FIELDS = {"e_f15bd1be633fc74e8194fe3d":"Type","e_08962458943de84beb8036bf":"Module","e_3266dd9e066e8eb021338b16":"Environment","e_55c905086afbcdcb371e67ef":"Customers","e_75f04c909919f9d70af3e50d":"DevCategory","e_853f8d5ac71d105380c5c7ff":"Category","e_d382583f666db910a3de62cc":"Reporter"}
PRI = {0:"-",1:"low",2:"med",3:"HIGH",4:"URG"}

def load(p):
    raw=json.load(open(p,encoding="utf-8"))
    if isinstance(raw,list): raw=json.loads(raw[0]["text"])
    return raw["rows"]

def day(ms): return datetime.datetime.fromtimestamp(ms/1000,datetime.timezone.utc).strftime("%m-%d")

def main(paths):
    rows={}
    for p in paths:
        for r in load(p): rows[r["id"]]=r
    out=[]; js={}
    for r in rows.values():
        p=r["properties"]; key=p["identifier"]; cf={}
        for fid,val in (p.get("cf") or {}).items():
            name=FIELDS.get(fid,fid); vals=val.get("v") or []
            cf[name]=[OPT.get(v,v) for v in vals] if name!="Reporter" else vals
        links=p.get("links") or []
        names=", ".join(r.get("assigneeNames") or [])[:32]
        f=lambda n: "+".join(cf.get(n,[])) or "_"
        out.append((p["sequenceNumber"], f'{key:8} {r["statusName"]:17} {PRI.get(p.get("priority",0),"?"):4} crt={day(r["createdTime"])} T={f("Type")} M={f("Module")} E={f("Environment")} D={f("DevCategory")} C={f("Category")} | {names:32} | L={len(links)} | {p["title"][:80]}'))
        js[key]={"id":r["id"],"version":r["version"],"statusId":p["statusId"],"statusName":r["statusName"],"priority":p.get("priority",0),"createdTime":r["createdTime"],"assignees":r.get("assignees"),"cf":cf,"links":links,"title":p["title"],"projectId":p.get("projectId","")}
    out.sort(reverse=True); print("\n".join(l for _,l in out))
    dest=os.path.join(os.path.dirname(os.path.abspath(paths[0])),"board-cf.json"); json.dump(js,open(dest,"w"),indent=1)
    print(f"# {len(rows)} issues; details in {dest}",file=sys.stderr)

if __name__=="__main__": main(sys.argv[1:])
