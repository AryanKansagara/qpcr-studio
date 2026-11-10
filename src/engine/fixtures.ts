// Small synthetic example exports in each instrument layout. Used by tests and offered as downloads on /docs.

export const CFX_CSV = `,Well,Fluor,Target,Content,Sample,Biological Set Name,Cq,Cq Mean,Cq Std. Dev,Starting Quantity (SQ),Log Starting Quantity,SQ Mean,SQ Std. Dev,Set Point,Well Note
,A01,SYBR,ACTB,Unkn-01,Ctrl-1,Control,18.12,18.10,0.03,,,,,60,
,A02,SYBR,ACTB,Unkn-01,Ctrl-1,Control,18.08,18.10,0.03,,,,,60,
,A03,SYBR,IL6,Unkn-01,Ctrl-1,Control,30.41,30.45,0.05,,,,,60,
,A04,SYBR,IL6,Unkn-01,Ctrl-1,Control,30.49,30.45,0.05,,,,,60,
,B01,SYBR,ACTB,Unkn-02,Trt-1,Treated,18.20,18.21,0.01,,,,,60,
,B02,SYBR,ACTB,Unkn-02,Trt-1,Treated,18.22,18.21,0.01,,,,,60,
,B03,SYBR,IL6,Unkn-02,Trt-1,Treated,27.40,27.43,0.04,,,,,60,
,B04,SYBR,IL6,Unkn-02,Trt-1,Treated,27.46,27.43,0.04,,,,,60,
,C01,SYBR,IL6,Std-01,Std 1,,22.10,22.10,0.00,50,1.699,,,60,
,H11,SYBR,IL6,NTC,,,NaN,0.00,0.00,,,,,60,
,H12,SYBR,ACTB,NRT,Ctrl-1,,34.80,34.80,0.00,,,,,60,
`

export const QUANTSTUDIO_TXT = `* Block Type = 96-Well Block (0.2mL)
* Chemistry = SYBR_GREEN
* Experiment Name = synthetic_example
* Instrument Type = QuantStudio 5 System
* Passive Reference = ROX

[Results]
Well\tWell Position\tOmit\tSample Name\tTarget Name\tTask\tReporter\tQuencher\tCT\tCt Mean\tCt SD\tQuantity\tTm1
1\tA1\tfalse\tCtrl-1\tGAPDH\tUNKNOWN\tSYBR\tNone\t19.204\t19.21\t0.01\t\t83.41
2\tA2\tfalse\tCtrl-1\tGAPDH\tUNKNOWN\tSYBR\tNone\t19.215\t19.21\t0.01\t\t83.38
3\tA3\tfalse\tCtrl-1\tIL6\tUNKNOWN\tSYBR\tNone\t30.112\t30.10\t0.02\t\t81.22
13\tB1\tfalse\tStd A\tIL6\tSTANDARD\tSYBR\tNone\t22.150\t22.15\t0.00\t50\t81.20
96\tH12\tfalse\tNTC\tIL6\tNTC\tSYBR\tNone\tUndetermined\t\t\t\t

[Amplification Data]
Well\tCycle\tTarget Name\tRn\tDelta Rn
`

export const LC480_TXT = `Experiment: synthetic_example  Selected Filter: SYBR Green I / HRM Dye (465-510)
Include\tColor\tPos\tName\tCp\tConcentration\tStandard\tStatus
True\t255\tA1\tCtrl-1\t18.25\t\t\t
True\t255\tA2\tCtrl-1\t18.31\t\t\t
True\t255\tB1\tStd 1\t15.30\t50.0\t50\t
True\t255\tB2\tStd 2\t18.68\t5.01\t5\t
True\t255\tB3\tStd 3\t22.05\t0.50\t0.5\t
True\t255\tH12\tNTC\t\t\t\t
`

export const ROTORGENE_CSV = `Experiment Information
Run Name,synthetic_example
Quantitation Information
Quantitation data for Cycling A.Green
No.,Colour,Name,Type,Ct,Given Conc (copies/reaction),Calc Conc (copies/reaction),% Var
1,,Ctrl-1,Unknown,18.21,,,
2,,Ctrl-1,Unknown,18.25,,,
13,,Std 1,Standard,15.40,10000,9850,1.5
72,,NTC,NTC,,,,
`

export const GENERIC_CSV = `well,sample,target,cq,tm,dilution,group
A1,Ctrl-1,ACTB,18.10,85.6,,Control
A2,Ctrl-1,ACTB,18.14,85.5,,Control
A3,Ctrl-1,IL6,30.4,81.2,,Control
B1,Std 1,IL6,22.1,81.2,50,
B2,Std 2,IL6,25.6,81.3,5,
H12,NTC,IL6,,,,
`
