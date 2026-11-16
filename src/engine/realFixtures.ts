// Excerpts of real instrument exports, used by the importer tests.
// QuantStudio and CFX rows are taken unchanged from the test data of the Allotropy project
// (https://github.com/Benchling-Open-Source/allotropy, MIT licence): the QuantStudio 7 Flex
// "96-Well Standard Curve" example run and a CFX Maestro duplex run exported without target names.
// The LightCycler and RDML fixtures are written here to match the layout of public example files
// (HTqPCR's LightCycler_sample.txt; RDML 1.0 to 1.4 files from the RDML consortium and the R RDML package).

export const QS_REAL_STANDARD_CURVE = `* Block Type = 96-Well Block (0.2mL)
* Chemistry = TAQMAN
* Experiment Name = QuantStudio 96-Well Standard Curve Example
* Experiment Type = Standard Curve
* Instrument Type = QuantStudio(TM) 7 Flex System
* Passive Reference = ROX
* Quantification Cycle Method = Ct

[Sample Setup]
Well	Well Position	Sample Name	Sample Color	Biogroup Name	Biogroup Color	Target Name	Target Color	Task	Reporter	Quencher	Quantity	Comments
1	A1	5K	"RGB(176,23,31)"			RNase P	"RGB(176,23,31)"	UNKNOWN	FAM	NFQ-MGB
2	A2	5K	"RGB(176,23,31)"			RNase P	"RGB(176,23,31)"	UNKNOWN	FAM	NFQ-MGB
[Amplification Data]
Well	Cycle	Target Name	Rn	Delta Rn
1	1	RNase P	0.522	0.008
1	2	RNase P	0.521	0.007
[Results]
Well	Well Position	Omit	Sample Name	Target Name	Task	Reporter	Quencher	CT	Ct Mean	Ct SD	Quantity	Quantity Mean	Quantity SD	Automatic Ct Threshold	Ct Threshold	Automatic Baseline	Baseline Start	Baseline End	Comments	Y-Intercept	R(superscript 2)	Slope	Efficiency	Amp Score	Cq Conf
1	A1	false	5K	RNase P	UNKNOWN	FAM	NFQ-MGB	27.102	27.211	0.063	5,720.562	5,314.592	227.193	true	0.074	true	3	23		39.814	0.997	-3.383	97.505	1.198	0.989
2	A2	false	5K	RNase P	UNKNOWN	FAM	NFQ-MGB	27.132	27.211	0.063	5,605.765	5,314.592	227.193	true	0.074	true	3	23		39.814	0.997	-3.383	97.505	1.194	0.988
3	A3	false	5K	RNase P	UNKNOWN	FAM	NFQ-MGB	27.189	27.211	0.063	5,389.334	5,314.592	227.193	true	0.074	true	3	23		39.814	0.997	-3.383	97.505	1.187	0.987
4	A4	false	5K	RNase P	UNKNOWN	FAM	NFQ-MGB	27.254	27.211	0.063	5,159.019	5,314.592	227.193	true	0.074	true	3	23		39.814	0.997	-3.383	97.505	1.184	0.988
5	A5	false	5K	RNase P	UNKNOWN	FAM	NFQ-MGB	27.236	27.211	0.063	5,220.032	5,314.592	227.193	true	0.074	true	3	23		39.814	0.997	-3.383	97.505	1.181	0.986
6	A6	false	5K	RNase P	UNKNOWN	FAM	NFQ-MGB	27.193	27.211	0.063	5,376.875	5,314.592	227.193	true	0.074	true	3	23		39.814	0.997	-3.383	97.505	1.182	0.989
37	D1	false		RNase P	NTC	FAM	NFQ-MGB	Undetermined						true	0.074	true	3	39		39.814	0.997	-3.383	97.505	0.000	0.000
38	D2	false		RNase P	NTC	FAM	NFQ-MGB	Undetermined						true	0.074	true	3	39		39.814	0.997	-3.383	97.505	0.000	0.000
39	D3	false		RNase P	NTC	FAM	NFQ-MGB	Undetermined						true	0.074	true	3	39		39.814	0.997	-3.383	97.505	0.000	0.000
40	D4	false		RNase P	NTC	FAM	NFQ-MGB	Undetermined						true	0.074	true	3	39		39.814	0.997	-3.383	97.505	0.000	0.000
41	D5	false		RNase P	STANDARD	FAM	NFQ-MGB	29.331	29.402	0.077	1,250.000			true	0.074	true	3	25		39.814	0.997	-3.383	97.505	1.126	0.981
42	D6	false		RNase P	STANDARD	FAM	NFQ-MGB	29.421	29.402	0.077	1,250.000			true	0.074	true	3	26		39.814	0.997	-3.383	97.505	1.125	0.984
43	D7	false		RNase P	STANDARD	FAM	NFQ-MGB	29.352	29.402	0.077	1,250.000			true	0.074	true	3	25		39.814	0.997	-3.383	97.505	1.125	0.983
44	D8	false		RNase P	STANDARD	FAM	NFQ-MGB	29.502	29.402	0.077	1,250.000			true	0.074	true	3	26		39.814	0.997	-3.383	97.505	1.129	0.981
45	D9	false		RNase P	STANDARD	FAM	NFQ-MGB	28.348	28.271	0.073	2,500.000			true	0.074	true	3	24		39.814	0.997	-3.383	97.505	1.146	0.984
46	D10	false		RNase P	STANDARD	FAM	NFQ-MGB	28.300	28.271	0.073	2,500.000			true	0.074	true	3	25		39.814	0.997	-3.383	97.505	1.156	0.981
47	D11	false		RNase P	STANDARD	FAM	NFQ-MGB	28.262	28.271	0.073	2,500.000			true	0.074	true	3	24		39.814	0.997	-3.383	97.505	1.156	0.985
48	D12	false		RNase P	STANDARD	FAM	NFQ-MGB	28.175	28.271	0.073	2,500.000			true	0.074	true	3	24		39.814	0.997	-3.383	97.505	1.161	0.986
49	E1	false		RNase P	STANDARD	FAM	NFQ-MGB	27.180	27.225	0.031	5,000.000			true	0.074	true	3	23		39.814	0.997	-3.383	97.505	1.176	0.987
50	E2	false		RNase P	STANDARD	FAM	NFQ-MGB	27.235	27.225	0.031	5,000.000			true	0.074	true	3	23		39.814	0.997	-3.383	97.505	1.176	0.990
51	E3	false		RNase P	STANDARD	FAM	NFQ-MGB	27.239	27.225	0.031	5,000.000			true	0.074	true	3	23		39.814	0.997	-3.383	97.505	1.166	0.988
52	E4	false		RNase P	STANDARD	FAM	NFQ-MGB	27.248	27.225	0.031	5,000.000			true	0.074	true	3	23		39.814	0.997	-3.383	97.505	1.164	0.985
53	E5	false		RNase P	STANDARD	FAM	NFQ-MGB	26.348	26.310	0.027	10,000.000			true	0.074	true	3	22		39.814	0.997	-3.383	97.505	1.167	0.984
54	E6	false		RNase P	STANDARD	FAM	NFQ-MGB	26.288	26.310	0.027	10,000.000			true	0.074	true	3	22		39.814	0.997	-3.383	97.505	1.168	0.988
55	E7	false		RNase P	STANDARD	FAM	NFQ-MGB	26.308	26.310	0.027	10,000.000			true	0.074	true	3	22		39.814	0.997	-3.383	97.505	1.165	0.985
56	E8	false		RNase P	STANDARD	FAM	NFQ-MGB	26.296	26.310	0.027	10,000.000			true	0.074	true	3	22		39.814	0.997	-3.383	97.505	1.166	0.986
57	E9	false		RNase P	STANDARD	FAM	NFQ-MGB	25.378	25.290	0.061	20,000.000			true	0.074	true	3	22		39.814	0.997	-3.383	97.505	1.170	0.985
58	E10	false		RNase P	STANDARD	FAM	NFQ-MGB	25.286	25.290	0.061	20,000.000			true	0.074	true	3	21		39.814	0.997	-3.383	97.505	1.176	0.988
59	E11	false		RNase P	STANDARD	FAM	NFQ-MGB	25.247	25.290	0.061	20,000.000			true	0.074	true	3	21		39.814	0.997	-3.383	97.505	1.177	0.987
60	E12	false		RNase P	STANDARD	FAM	NFQ-MGB	25.248	25.290	0.061	20,000.000			true	0.074	true	3	21		39.814	0.997	-3.383	97.505	1.179	0.988
`

export const CFX_REAL_DUPLEX = `,Well,Fluor,Target,Content,Sample,Biological Set Name,Cq,Cq Mean,Cq Std. Dev,Starting Quantity (SQ),Log Starting Quantity,SQ Mean,SQ Std. Dev,Set Point,Well Note
,A01,FAM,,Unkn,M3905 R Ctx,PBS Baseline,21.1877528266099,21.1877528266099,0,NaN,NaN,NaN,0,60,
,A02,FAM,,Unkn,M3905 R Ctx,PBS Baseline,21.1025534163483,21.1025534163483,0,NaN,NaN,NaN,0,60,
,A03,FAM,,Unkn,M4181 R Ctx,PBS Baseline,22.5194977976743,22.5194977976743,0,NaN,NaN,NaN,0,60,
,A04,FAM,,Unkn,M4181 R Ctx,PBS Baseline,22.5040807858603,22.5040807858603,0,NaN,NaN,NaN,0,60,
,A01,VIC,,Unkn,M3905 R Ctx,PBS Baseline,21.1590717001335,21.1590717001335,0,NaN,NaN,NaN,0,60,
,A02,VIC,,Unkn,M3905 R Ctx,PBS Baseline,21.0520703748196,21.0520703748196,0,NaN,NaN,NaN,0,60,
,A03,VIC,,Unkn,M4181 R Ctx,PBS Baseline,22.0378602901219,22.0378602901219,0,NaN,NaN,NaN,0,60,
,A04,VIC,,Unkn,M4181 R Ctx,PBS Baseline,22.0335314481507,22.0335314481507,0,NaN,NaN,NaN,0,60,
`

// LightCycler 480 Abs Quant export: the Standard column holds 0 for every well that is not a standard.
export const LC480_REAL_LAYOUT = `Experiment: Demo Abs Quant with SYBR Green I  Selected Filter: SYBR Green (483-533)\t\t\t\t\t\t\t
Include\tColor\tPos\tName\tCp\tConcentration\tStandard\tStatus
True\t255\tA1\tSample 1\t16.13\t1.01E+05\t0\t
True\t65280\tA2\tSample 2\t\t\t0\t
False\t255\tA3\tSample 3\t24.90\t2.81E+02\t0\t
True\t128\tF9\tStandard 1\t12.64\t1.02E+06\t1000000\t
True\t128\tF10\tStandard 2\t16.06\t1.06E+05\t100000\t
True\t128\tF11\tStandard 3\t19.6\t1.03E+04\t10000\t
True\t128\tF12\tStandard 4\t23\t1.08E+03\t1000\t
`

// Design & Analysis 2 spreadsheet: key/value header rows, "Sample", "Target" and "Cq" columns, no Quantity
// column on the Results sheet, and a key/value footer after a blank row.
export const DA2_RESULTS_SHEET: string[][] = [
  ['File Name', 'QS1_Standard_Curve.eds'], ['Instrument Type', 'QuantStudio™ 1 System'], ['Block Type', '96-Well 0.2-mL Block'], ['Quantification Cycle Method', 'CT'], [''],
  ['Well', 'Well Position', 'Omit', 'Sample', 'Target', 'Task', 'Reporter', 'Quencher', 'Amp Status', 'Amp Score', 'Curve Quality', 'Result Quality Issues', 'Cq', 'Cq Confidence', 'Cq Mean', 'Cq SD'],
  ['1', 'A1', 'FALSE', 'Unk_5K', 'RNaseP', 'UNKNOWN', 'FAM', 'NFQ-MGB', 'AMP', '1.28', '', '', '28.03761726', '0.978', '28.342', '0.173'],
  ['2', 'A2', 'TRUE', 'Unk_5K', 'RNaseP', 'UNKNOWN', 'FAM', 'NFQ-MGB', 'AMP', '1.27', '', '', '28.29986117', '0.972', '28.342', '0.173'],
  ['13', 'B1', 'FALSE', '', 'RNaseP', 'NTC', 'FAM', 'NFQ-MGB', 'NO_AMP', '0', '', '', 'UNDETERMINED', '0', '', ''],
  ['14', 'B2', 'FALSE', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['41', 'D5', 'FALSE', 'Std_1250', 'RNaseP', 'STANDARD', 'FAM', 'NFQ-MGB', 'AMP', '1.20', '', '', '30.43736422', '0.980', '30.463', '0.328'],
  ['45', 'D9', 'FALSE', 'Std_2500', 'RNaseP', 'STANDARD', 'FAM', 'NFQ-MGB', 'AMP', '1.21', '', '', '29.41', '0.981', '29.40', '0.05'],
  ['49', 'E1', 'FALSE', 'Std_5K', 'RNaseP', 'STANDARD', 'FAM', 'NFQ-MGB', 'AMP', '1.22', '', '', '28.39', '0.979', '28.40', '0.04'],
  ['53', 'E5', 'FALSE', 'Std_10K', 'RNaseP', 'STANDARD', 'FAM', 'NFQ-MGB', 'AMP', '1.22', '', '', '27.38', '0.982', '27.37', '0.03'],
  ['57', 'E9', 'FALSE', 'Std_20K', 'RNaseP', 'STANDARD', 'FAM', 'NFQ-MGB', 'AMP', '1.23', '', '', '26.36', '0.984', '26.35', '0.02'],
  ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['Analysis Type', 'Singleplex'], ['Endogenous Control', 'RNaseP'],
]

// RDML 1.1 as written by plate instruments: numbered reactions on an 8 x 12 format, GUID sample ids with the
// visible name in <description>, a dye-prefixed target id, curve points, two targets in one well.
export const RDML_PLATE = `<?xml version="1.0" encoding="utf-8"?>
<rdml version="1.1" xmlns="http://www.rdml.org">
  <dateMade>2014-08-19T11:25:48</dateMade>
  <id><publisher>Roche Diagnostics</publisher><serialNumber>1.1.0.1320</serialNumber></id>
  <sample id="9c93d5da-1797-44c1-b46c-05d501af4e22"><description>Liver &amp; kidney 1</description><type>unkn</type></sample>
  <sample id="4b691c97-a0cc-4948-8e9c-cacad929b502"><description>Sample 39</description><type>std</type><quantity><value>1000</value><unit>cop</unit></quantity></sample>
  <sample id="H2O"><type>ntc</type></sample>
  <target id="FAM@30116ec1-44f6-4c9c-9c69-5d6f00226d4e"><type>toi</type><dyeId id="FAM" /></target>
  <target id="bACT"><type>ref</type><dyeId id="Hex" /></target>
  <experiment id="ca1eb225-ecea-4793-9804-87bfbb45f81d">
    <run id="Plate 1">
      <pcrFormat><rows>8</rows><columns>12</columns><rowLabel>ABC</rowLabel><columnLabel>123</columnLabel></pcrFormat>
      <runDate>2014-08-19T11:30:20</runDate>
      <react id="1"><sample id="9c93d5da-1797-44c1-b46c-05d501af4e22" />
        <data><tar id="FAM@30116ec1-44f6-4c9c-9c69-5d6f00226d4e" /><cq>24.09</cq><adp><cyc>1</cyc><tmp>60</tmp><fluor>0.02</fluor></adp><adp><cyc>2</cyc><tmp>60</tmp><fluor>0.03</fluor></adp></data>
        <data><tar id="bACT" /><cq>18.5</cq><excl>pipetting error</excl></data>
      </react>
      <react id="14"><sample id="4b691c97-a0cc-4948-8e9c-cacad929b502" /><data><tar id="bACT" /><cq>21.75</cq></data></react>
      <react id="96"><sample id="H2O" /><data><tar id="bACT" /><cq>-1.0</cq></data></react>
    </run>
    <run id="Plate 2">
      <pcrFormat><rows>8</rows><columns>12</columns><rowLabel>ABC</rowLabel><columnLabel>123</columnLabel></pcrFormat>
      <react id="25"><sample id="H2O" /><data><tar id="bACT" /><cq>NaN</cq></data></react>
      <react id="26"><sample id="9c93d5da-1797-44c1-b46c-05d501af4e22" /><data><tar id="bACT" /><cq>19.02</cq><meltTemp>84.5</meltTemp></data></react>
    </run>
  </experiment>
</rdml>
`

// RDML 1.0 as written by StepOne software: well names as reaction ids, "free format" plates.
export const RDML_V10 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rdml xmlns="http://www.rdml.org" version="1.0">
    <sample id="NTC_RNase P"><type>ntc</type></sample>
    <sample id="STD_RNase P_10000.0"><type>std</type><quantity><value>10000.0</value><unit>other</unit></quantity></sample>
    <target id="RNase P"><type>toi</type><dyeId>FAM</dyeId></target>
    <experiment id="Standard Curve Example">
        <run id="Run001">
            <pcrFormat>free format</pcrFormat>
            <runDate>2006-11-10T09:24:39.265</runDate>
            <react id="A1"><sample id="NTC_RNase P"/><data><tar id="RNase P"/><cq>40.0</cq><quantity><value>NaN</value><unit>cop</unit></quantity></data></react>
            <react id="B7"><sample id="STD_RNase P_10000.0"/><data><tar id="RNase P"/><cq>26.31</cq></data></react>
        </run>
    </experiment>
</rdml>
`
