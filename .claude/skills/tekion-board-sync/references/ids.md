# Ids for the Tekion board sync

Verified against atlas.unifyapps.com on 22 Oct 2026. Re-fetch with `fetch_statuses`, `fetch_custom_fields` and `fetch_users` if anything looks off.

## Slack

- Channel `#tekion-delivery`: `C0A1EPNSLJ1`
- Thread URL: `https://unifyapps.slack.com/archives/C0A1EPNSLJ1/p<ts without the dot>`

## Atlas

- Team Tekion Tasks (TEK): `2604063610`
- Project Tekion: `8118998788`
- Other boards, read only: DT (AO) `3781554875`, AI Agents (AI) `2808445654`, Enterprise Brain (EB) `2702924697`

## Statuses (TEK), in board order

| Name | Category | Id |
|---|---|---|
| Backlog | backlog | `e_6aa2b2d635cc1f4f3c87663e` |
| Research | unstarted | `e_6aa2b2d635cc1f4f3c87663f` |
| Design Todo | unstarted | `e_6aa2b2d635cc1f4f3c876640` |
| Dev Todo (default) | unstarted | `e_6aa2b2d635cc1f4f3c876641` |
| Awaiting Customer | unstarted | `e_6aa2b2d66838a7063627a91b` |
| In Design | started | `e_6aa2b2d635cc1f4f3c876642` |
| Design Review | started | `e_6aa2b2d66838a7063627a914` |
| In Dev | started | `e_6aa2b2d66838a7063627a915` |
| Dev Testing | started | `e_6aa2b2d635cc1f4f3c876643` |
| Dev Review | started | `e_6aa2b2d66838a7063627a916` |
| Dev Blocked | started | `e_6aa2b2d635cc1f4f3c876644` |
| QA Blocked | started | `e_6aa2b2d635cc1f4f3c876645` |
| QA Rejected | started | `e_6aa2b2d635cc1f4f3c876646` |
| UAT Rejected | started | `e_6aa2b2d635cc1f4f3c876647` |
| In QA | completed | `e_6aa2b2d66838a7063627a917` |
| In UAT | completed | `e_6aa2b2d635cc1f4f3c876648` |
| Ready to Release | completed | `e_6aa2b2d635cc1f4f3c876649` |
| Done | completed | `e_6aa2b2d66838a7063627a918` |
| Canceled | canceled | `e_6aa2b2d66838a7063627a919` |
| Duplicate | canceled | `e_6aa2b2d66838a7063627a91a` |

Status keys for the `statusKey IN` filter: `backlog research design_todo dev_todo awaiting_customer in_design design_review in_dev dev_testing dev_review dev_blocked qa_blocked qa_rejected uat_rejected in_qa in_uat ready_to_release done canceled duplicate`.

## Custom fields

| Field | Id | Values |
|---|---|---|
| Type (workspace, single) | `e_f15bd1be633fc74e8194fe3d` | Feature `e_1ba00243fb3725d59cae62a3`, Bug `e_d51dc5283d6365c312c865cf`, Improvement `e_feec88a4ec095231f7b1e3a2`, Task `e_b11aff7558c171f61b6bb79f` |
| Module (team, multi) | `e_08962458943de84beb8036bf` | Application `e_0574685aa63b7e2a8401d3ce`, Automation `e_f4284fc0c502f93b6594a3be`, Platform `e_55f453730c2a50931496b1bf`, Connector `e_e29a338651389353cfe79ec6`, Agents `e_4cf07e73022c6c45899db345`, Changeset `e_1ab2143af91e6c20c0119f8a`, API Group `e_b00965d1e00892b17fa6e134`, Object Manager `e_ba33aa364f0eb40a6f7a8b7a`, Infra `e_b2def32365a01523da358b96`, Pipeline `e_24dd6e0dfcbdf7379f3516aa`, Product `e_f67de52242bf4cf3ed74e9bd` |
| Environment (team, multi) | `e_3266dd9e066e8eb021338b16` | Production `e_0dbc627df3af346cbca526d9`, Pre Production `e_dc095f8dfc61546e75d777c2`, Internal UA `e_86e9f37ce6a8a787521b9d4c` |
| Customers (workspace, multi) | `e_55c905086afbcdcb371e67ef` | Tekion `e_f72dffd52e1f13acbf28e22d` |
| Reporter (team, person) | `e_d382583f666db910a3de62cc` | userIds |
| Dev Category (workspace, multi) | `e_75f04c909919f9d70af3e50d` | UI `e_67bbbf4d8a30491460ce98d5`, BE `e_4b70001e6e5e679dd55240f3`, UI+BE `e_6f2b3865d64afedcff6ba220`, Config `e_e638e7aa8cdd0e5721cb2c8b`, Infra `e_1932197870cc34fa885c1b8f`, QA `e_d6dcb7869e99f35f39fdceb3`, Design `e_d9971c0d605ae1ab79c4a688`, Product `e_b9053034eac409bb1210452b`, Connector `e_d941f82bdd22e71df40bdf78`, DevOps `e_ad0c8497211a883f3cc00bb5` |
| Category (workspace, single) | `e_853f8d5ac71d105380c5c7ff` | Blocker `e_0762e1ba05df03819188ee0a`, Config Tasks `e_2b8d0613a6c7d1b44d12efb7`, QA Issue `e_8287967c8ff5bb25ef403ef3` |

Environments: `platform.toc.tekioncloud.xyz` and `finance.toc.tekioncloud.xyz` are Pre Production; `platform.toc.tekioncloud.com` is Production; Orbit (`orbit.uat.unifyapps.com`) is Internal UA.

Slack subteam `S082AN66QV6` is the BE/agents group that delivery tags on pre-prod issues; mention it as `<!subteam^S082AN66QV6>`.

## People: Atlas userId and Slack id

Confirmation list (their "resolved" closes a ticket): Jaimin Prajapati, Harsh Bansal, Jay Rathod, Meet Andharia, Shikha Choudhary, Vaibhav Dhand.

| Person | Atlas | Slack | Role |
|---|---|---|---|
| Shikha Choudhary | 511577 | U09ME1BHLEL | delivery, runs this sync |
| Jaimin Prajapati | 511604 | U0A2L3N0H38 | delivery, files most TEK tickets |
| Harsh Bansal | 511510 | U08NQDNFF7Y | delivery |
| Vaibhav Dhand | 511409 | U07123XR65R | delivery lead |
| Jay Rathod | 511533 | U0A2N4QNUKC | delivery, finance |
| Meet Andharia | 511535 | U0A2RN2590U | delivery |
| Vinod Ramanathan | 516400 | U0AR640NLQ4 | client coordination, Jira with Tekion; assignee for Awaiting Customer |
| Ankit Mishra | 519522 | U0BS0LA6XPV | ops / monitoring |
| Aryam Singh (aryam) | 511616 | U0867RW4UUS | BE |
| Vihar Shah | 511631 | U077B1VER0B | BE lead |
| Navaneshwar Reddy | 511600 | U07AVA1BNUF | agents BE |
| Kaniz Fatima | 510856 | U09B043DFUK | connectors |
| Vaghani Devang | 511456 | U0A7M9BVD88 | BE (StarRocks, Orbit) |
| Devang (DevOps) | 516139 | U0AKQ4VUK4Z | DevOps |
| Atul Prajapati | 514904 | U08GK9S0DND | DevOps |
| Kunwar Pratap Singh | 514898 | U0BKX9838TY | DevOps lead |
| Anuj Mittal | 511518 | U074643VA1G | FE |
| Shailendra Singh | 511626 | U07B1ASMEFJ | FE, copilot component |
| Josh Ujwal Immadisetty | 511554 | U078DBE55V1 | platform |
| Rishi Patel | 511475 | U0A6R15DVSA | agents BE |
| Kavish Manubolu | 511598 | U06BXQQ8A2H | agents BE |
| Hatim | 511627 | U077PT0F63T | agents BE |
| Harsh Singh | 511328 | U0A6S9RHPK4 | agents / sandbox |
| Raghav Arora | 511576 | U08US2PEQ3H | BE |
| Parth Parekh | 511461 | U0A75TXP9UZ | BE |
| Krunal Chhagani | 511617 | U076WL1CD55 | BE lead |
| Harit Rajkotiya | 511632 | U087DL2203U | BE lead |
| Aditya Kumar Rai | 511441 | U087711D7E2 | BE |
| Hemanth Sai Gubala | 511549 | U07BD4J5UH1 | connectors |
| Kotha Uday Kumar | 511345 | U07BAAE524D | connectors |
| Lovekesh Garg | 511597 | U073CGCNXSB | connectors lead |
| Rajeev Kumar | 511452 | U0893K88RLZ | connectors lead |
| Utsav Kanani | 511448 | U0A75U0DHFB | BE |
| Bhavesh Baraiya | 511594 | U087D9P1RPU | platform |
| Arnesh Dadhich | 511350 | U07340C9A83 | agents |
| Yash Ahlawat | 511429 | U07CCRW0DE3 | connectors |
| Himanshu Nandan | 511078 | U0ACBP0QNSE | finance solutions |
| Abhishek Anand | 511622 | — | FE |
| Mihir Patel | 511447 | U0A6LKQ5FFV | platform |
| Dakshveer Singh Chauhan | 511634 | U077ZV72CMN | platform lead, groovy/scripts |
| Anshul Srivastava | 511027 | U098DQLAV1C | support, raises Tekion P0 tickets |
| Rachamalla Satyanadh | 511353 | U09KB4G28F8 | security |
| Vishnu Vardhan Vippala (Vishnu Reddy.V) | 511355 | U09K6RG4K19 | security reviewer |
| Zeel Danani | 511379 | U0A6T0SGFC2 | BE |
| Devashish Siwatch | 511636 | U07AFM866PM | BE lead |
| Dhrupal Kukadia | 511451 | U077B6EPSSW | observability |
| Sumit Bansal | 511542 | U086WM52Y56 | observability |
| Darshak Zankat | 511537 | U088257GBNU | FE lead |
| Harshit Davda | 511618 | U07667AKMU4 | FE lead |
| Vineet Chauhan | 511624 | U087G4WJ3N0 | FE |
| Manikya Sharma | 511435 | U0A6SAXLMRQ | FE |
| Mahavir Sancheti | 511357 | U0A7MA9F2F2 | agents |
| Sahil Chhabra | 511551 | U086180139U | BE |
| Yashika Gupta | 511406 | U0A6LLKLUM9 | BE |
| Yash Tarpara | 511378 | U0A6NQQ9GJH | BE |
| Jay Goyani | 511466 | U0A6WJ69R3N | BE |
| Keyur Govrani | 511633 | U087D9FUJJE | FE |
| Pulkit Pathak | 511426 | — | ai-python |
| Dev Dodiya | 511486 | U0A6PHMQX4M | infra / builds |
| Areeb Khan | 511303 | — | BE |
| Sai Suma Tappeta | 510724 | U0B0CN10BJ8 | security scans |
| Utkarsh Singhal | 510784 | — | BE, context graph |
| Shivam Singhal | 511482 | U06TR4MRY6T | agents BE, SEV-245 |
| Sanskar Singh | 511610 | U073GNURMJ5 | BE |
| Rishabh Jain (rishabh.jain) | 511572 | U09CV2VQ17X | APM, raises Tekion asks; rishabh.jain1 is 510815 / U0BCFE0H4Q2 |
| Sourav Thakur | 515042 | — | partner, Sev0 |
| Harmit Khimani | 511361 | U0A6Q7WH5GE | data pipeline, UAT/live PRs |
| Swetank Pandey | 511376 | U0882CGL8KA | data pipeline BE |
| Vraj Gandhi | 511580 | U0A2FNWTM19 | app config / UI |
| Karan Bhatia | 511605 | — | data pipeline lead |
| Naman Kumar | 511427 | — | agents BE |
| Prakhar Joshi | 511556 | — | agents BE |
| Vishnu Vardhan | 511575 | U0767TBRJ02 | FE, forms/tables |
| Ankit Vikal | 511417 | U0A6BGZUB71 | FDE automations |
| Abhay Sharma | 511619 | U076MCF94NN | AI Solutions lead |
| Neel Vasoya | 510930 | U0B4EGCRQFL | AI Solutions, files TTS tickets |
| Mitul Sudani | 511301 | U0A6T292BEE | agents BE |
| Dharmi Patel | 511557 | U0A6S7SC7HQ | agents BE |
| Sagar Arora | 510903 | U0B7EKTF909 | text-to-config BE |
| Dharmesh Kota | 511389 | U0A75U3FL5P | copilot config |
| Ravi Kumar Sharma | 514928 | U07MJJUNS2X | sanity / QA coordination |
| Rahul Bhanushali | 511190 | — | UAT env deployments |
| Ishu | 511400 | U0A6WJ2DTJ8 | FE |
| Vedant Poddar | 511483 | U07K0QL8STV | agents |
| Rhythm Panchal | 511377 | U0A6T189W5Q | connectors BE |
| Aditya Singhal | 511477 | U08651TCZB7 | agents BE |
| Yash Patel | 511415 | U086FBK9VA9 | automation BE |
| Nilesh Suthar | 511615 | U062HE04K8W | text-to-app |
| Heet Thakkar | 511398 | U0A6LHMJZSP | agents BE |
| Pranshu Lakhotia | 511419 | U0A6L0QA21H | agents BE |
| Abhinav Singi | — | U062ANA21DZ | merges |
| Rachit Mittal | — | U06BSBSFR54 | CTO office, asks for the board, merges uacode PRs |
| Apurba | — | U0BCFE5AUTU | leadership |
| Rishit Unadkat | 511396 | U0A6ATP8UTZ | agents BE (not 511399, a gmail duplicate) |
| Gaurav Kumar | 511620 | U086WLWLU80 | BE (gaurav.kumar@, not gaurav.kumar1@ 511423) |
| Dhruv Goti | - | U087SC35SGH | agents BE lead |
| Thanusree | - | U07BRT1Q65P | connectors |
| Harshverdhan Swami | - | U06FL2TP57D | connectors |
| Shrey Bavishi | 511449 | U0A6KS8SC6P | BE |
| Kishansinh Puvar | 511365 | U0A6ARHMTV5 | knowledge/indexing BE |
| Zeel Boghara | 511337 | U0A6VSW7V6Y | connectors BE |
| Abhinav Poddar | 511625 | U072TQVJRKQ | sandbox/skills BE |
| Josh Ujwal Immadisetty | 511554 | U078DBE55V1 | BE |
| Prakhar Chaturvedi | 511558 | U06PHUNM0UQ | code app builder lead |
| Utsav Kanani | 511448 | U0A75U0DHFB | agents BE |
| Rishi Patel | 511475 | U0A6R15DVSA | text-to-config BE |
| Keyur Govrani | 511633 | U087D9FUJJE | FE (dup row ok) |
