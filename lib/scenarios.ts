// Centralized scenario presets. Single source of truth.
// Add new scenarios here so UI + server share identical defaults.

export interface ScenarioPreset {
  id: string;
  name: string;
  text: string;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'default',
    name: 'Chronic Conditions (Default)',
  text: `Member: John Smith (member_id M123456) Age 47 Male ZIP 30310. Conditions: Type 2 Diabetes; Hypertension; Hyperlipidemia. Preferred pharmacy: Mail Order (PHARM_MAIL_001); Local: CVS #123 (PHARM_CVS_123).
Plan: PLAN_ID PLAN10 FORMULARY STD_GENERIC_PREF PHARM_DED_TOTAL 200 PHARM_DED_USED 200 PHARM_DED_REMAIN 0 COPAY_TIER1 10 COPAY_TIER2 40 COPAY_TIER3 75 COPAY_TIER4 250 COINS_PHARM_AFTER_DED 0.20 MAIL_ORDER_PREFERRED true.
Allergies: Penicillin (rash).
Active Prescriptions:
PRESCRIPTION RX1000 Metformin 1000mg TAB qty180 days90 refills3 NDC10000000001 last_filled 2025-08-15 status ACTIVE pharmacy PHARM_MAIL_001 tier1
PRESCRIPTION RX1001 Lisinopril 20mg TAB qty90 days90 refills2 NDC10000000002 last_filled 2025-08-05 status ACTIVE pharmacy PHARM_MAIL_001 tier1
PRESCRIPTION RX1002 Atorvastatin 40mg TAB qty90 days90 refills1 NDC10000000003 last_filled 2025-07-30 status ACTIVE pharmacy PHARM_CVS_123 tier2
PRESCRIPTION RX1003 Semaglutide 1mg/0.74mL PEN qty4pens days28 refills0 NDC10000000004 last_filled 2025-08-12 status REFILL_DUE pharmacy PHARM_MAIL_001 tier3
PRESCRIPTION RX1004 Albuterol HFA 90mcg INH qty1 days30 refills2 NDC10000000005 last_filled 2025-08-20 status ACTIVE pharmacy PHARM_CVS_123 tier1
Operational:
REFILL_ELIGIBLE RX1003 earliest_refill_date 2025-09-05
TRANSFER_CANDIDATE RX1002 from PHARM_CVS_123 to PHARM_MAIL_001 reason sync_90_day
Notes: Member wants to consolidate refills via mail order; asks about weight management support. Goals: improve adherence; modest weight loss; maintain LDL control.`
  },
  {
    id: 'prior_auth',
    name: 'Specialty Drug Prior Auth',
  text: `Member: Emily Davis (member_id M789321) Age 34 Female ZIP 30312. Condition: Severe plaque psoriasis. Preferred pharmacy: Specialty (PHARM_SPEC_001); Local: CVS #123 (PHARM_CVS_123).
Plan: PLAN_ID PLAN22 FORMULARY DERMA_STEP PHARM_DED_TOTAL 200 PHARM_DED_USED 140 PHARM_DED_REMAIN 60 COPAY_TIER1 10 COPAY_TIER2 40 COPAY_TIER3 75 COPAY_TIER4 250 COINS_PHARM_AFTER_DED 0.20 MAIL_ORDER_PREFERRED false.
Allergies: Sulfa (rash).
Active Prescriptions:
PRESCRIPTION RX3000 Guselkumab 100mg/mL SYR qty2 days56 refills0 NDC50000000001 last_filled 2025-06-01 status PA_PENDING PA_ID PA555 pharmacy PHARM_SPEC_001 tier4
PRESCRIPTION RX3001 Folic Acid 1mg TAB qty90 days90 refills1 NDC50000000002 last_filled 2025-07-25 status ACTIVE pharmacy PHARM_MAIL_001 tier1
PRESCRIPTION RX3002 Cetirizine 10mg TAB qty30 days30 refills2 NDC50000000003 last_filled 2025-08-18 status ACTIVE pharmacy PHARM_CVS_123 tier1
PRESCRIPTION RX3003 Ibuprofen 400mg TAB qty60 days30 refills0 NDC50000000004 last_filled 2025-08-20 status PRN pharmacy PHARM_CVS_123 tier1
PRESCRIPTION RX3004 Clobetasol 0.05% OINT qty1 tube days30 refills0 NDC50000000005 last_filled 2025-08-22 status ACTIVE pharmacy PHARM_CVS_123 tier2
Operational:
PA_PENDING PA_ID PA555 drug Guselkumab submitted 2025-08-20 expected_decision 2025-09-07
STEP_HISTORY topical_steroids inadequate; phototherapy partial; methotrexate intolerance elevated_LFTs
REFILL_ELIGIBLE RX3001 earliest_refill_date 2025-09-22
Notes: Member inquires about injection training and PA timeline; cost concern about tier4 copay if approved.`
  },
  {
    id: 'high_deductible',
    name: 'Early Year High Deductible',
  text: `Member: Mark Lee (member_id M555777) Age 52 Male ZIP 30315. Conditions: Hyperlipidemia; GERD; Mild Asthma; Seasonal Rhinitis. Preferred pharmacy: Walgreens (PHARM_WAL_456); Considering mail order for 90-day fills.
Plan: PLAN_ID HDHP90 FORMULARY STD_GENERIC_PREF PHARM_DED_TOTAL 2000 PHARM_DED_USED 146 PHARM_DED_REMAIN 1854 COPAY_TIER1 0 (ded_applies) COPAY_TIER2 0 COPAY_TIER3 0 COPAY_TIER4 0 COINS_PHARM_AFTER_DED 0.20 MAIL_ORDER_PREFERRED evaluating.
Allergies: None reported.
Active Prescriptions:
PRESCRIPTION RX4000 Rosuvastatin 20mg TAB qty90 days90 refills2 NDC60000000001 last_filled 2025-08-10 status ACTIVE pharmacy PHARM_WAL_456 tier2
PRESCRIPTION RX4001 Omeprazole 40mg CAP DR qty90 days90 refills1 NDC60000000002 last_filled 2025-08-28 status READY_PICKUP pharmacy PHARM_WAL_456 tier2
PRESCRIPTION RX4002 Albuterol HFA 90mcg INH qty1 days30 refills2 NDC60000000003 last_filled 2025-08-19 status ACTIVE pharmacy PHARM_WAL_456 tier1
PRESCRIPTION RX4003 Fluticasone 50mcg NASAL qty1 days60 refills1 NDC60000000004 last_filled 2025-07-30 status ACTIVE pharmacy PHARM_WAL_456 tier1
PRESCRIPTION RX4004 Celecoxib 200mg CAP qty30 days30 refills0 NDC60000000005 last_filled 2025-08-24 status ACTIVE pharmacy PHARM_WAL_456 tier3
Operational:
READY_PICKUP RX4001 ready_date 2025-09-03 pickup_by 2025-09-10 notification_sent true
COST_QUESTION statin lower_cost_generic vs current rosuvastatin
TRANSFER_CONSIDERATION 90_day mail_order evaluation
Notes: Member requests price estimate before filling non-urgent refills; wants to minimize upfront spend until deductible met.`
  },
  {
    id: 'polypharmacy_risk',
    name: 'Polypharmacy + Interaction Risk',
  text: `Member: Linda Nguyen (member_id M998877) Age 68 Female ZIP 30318. Conditions: Type 2 Diabetes; Atrial Fibrillation; CHF NYHA II; Osteoarthritis; Depression; Chronic Pain. Preferred pharmacy: Mail Order (PHARM_MAIL_001); Local: Independent Pharmacy #55 (PHARM_IND_055).
Plan: PLAN_ID PLAN65 FORMULARY CARDIO_PLUS PHARM_DED_TOTAL 200 PHARM_DED_USED 200 PHARM_DED_REMAIN 0 COPAY_TIER1 10 COPAY_TIER2 40 COPAY_TIER3 75 COPAY_TIER4 250 COINS_PHARM_AFTER_DED 0.15 MAIL_ORDER_PREFERRED true.
Allergies: Codeine (nausea).
Active Prescriptions:
PRESCRIPTION RX5000 Metformin ER 1000mg TAB qty180 days90 refills2 NDC70000000001 last_filled 2025-08-14 status ACTIVE pharmacy PHARM_MAIL_001 tier1
PRESCRIPTION RX5001 Empagliflozin 25mg TAB qty90 days90 refills1 NDC70000000002 last_filled 2025-08-12 status ACTIVE pharmacy PHARM_MAIL_001 tier3
PRESCRIPTION RX5002 Apixaban 5mg TAB qty180 days90 refills2 NDC70000000003 last_filled 2025-08-10 status ACTIVE pharmacy PHARM_MAIL_001 tier2
PRESCRIPTION RX5003 Metoprolol Succinate 50mg TAB ER qty90 days90 refills1 NDC70000000004 last_filled 2025-08-05 status ACTIVE pharmacy PHARM_MAIL_001 tier1
PRESCRIPTION RX5004 Sacubitril/Valsartan 24/26mg TAB qty180 days90 refills0 NDC70000000005 last_filled 2025-08-08 status REFILL_DUE pharmacy PHARM_MAIL_001 tier3
PRESCRIPTION RX5005 Furosemide 20mg TAB qty90 days90 refills1 NDC70000000006 last_filled 2025-08-15 status ACTIVE pharmacy PHARM_MAIL_001 tier1
PRESCRIPTION RX5006 Duloxetine 60mg CAP qty90 days90 refills1 NDC70000000007 last_filled 2025-07-30 status ACTIVE pharmacy PHARM_MAIL_001 tier2
PRESCRIPTION RX5007 Tramadol 50mg TAB qty30 days30 refills0 NDC70000000008 last_filled 2025-08-25 status PRN pharmacy PHARM_IND_055 tier2
Operational:
REFILL_ELIGIBLE RX5004 earliest_refill_date 2025-09-05
INTERACTION_FLAG Duloxetine+Tramadol serotonin_risk; Tramadol+CNS fall_risk
ADHERENCE_NOTE occasional late refill on Duloxetine
FALL_RISK_MONITOR yes
Notes: Pharmacist to counsel on interaction mitigation and synchronization of cardiovascular meds.`
  },
  {
    id: 'pharmacy_core_demo',
    name: 'Pharmacy Core Demo',
    text: `Member: Maria Lopez (member_id M456789) DOB 1983-09-14 Female ZIP 30309. Preferred pharmacy: Mail Order (PHARM_MAIL_001); Local: CVS #123 (PHARM_CVS_123). PLAN_ID PLAN22 FORMULARY STD_GENERIC_PREF PHARM_DED_TOTAL 200 PHARM_DED_USED 200. Allergies: Penicillin (rash), Sulfa (rash).
Active Prescriptions: Metformin 1000mg #180 3 refills (RX2100) last_filled 2025-08-15 MAIL; Lisinopril 20mg #90 2 refills (RX2101) last_filled 2025-08-05 MAIL; Atorvastatin 40mg #90 1 refill (RX2102) last_filled 2025-07-30 CVS123; Semaglutide 1mg pen 4 pens 0 refills (RX2103) last_filled 2025-08-12 REFILL_DUE MAIL; Guselkumab 100mg/mL 2 syr 0 refills (RX2104) last_filled 2025-06-01 PA_PENDING PA_ID PA789 SPECIALTY; Duloxetine 60mg #90 1 refill (RX2105) last_filled 2025-07-28 MAIL; Tramadol 50mg #30 0 refills (RX2106) last_filled 2025-08-25 PRN CVS123; Albuterol HFA 90mcg 1 inhaler 2 refills (RX2107) last_filled 2025-08-20 CVS123.
Operational: READY_PICKUP RX2102 ready_date 2025-09-03 pickup_by 2025-09-10; REFILL_ELIGIBLE RX2103 earliest_refill_date 2025-09-05; TRANSFER_CANDIDATE RX2102 from CVS123 to MAIL.
Notes: PA guselkumab pending after step therapy (topicals, phototherapy, methotrexate intolerance). Member asked about lower-cost statin. Interaction flag: Duloxetine + Tramadol. Adherence: missed 2 Metformin doses last month.`
  }
];

export const DEFAULT_SCENARIO = SCENARIO_PRESETS[0].text;
