/**
 * ============================================================================
 *  WarehouseDashboard.jsx
 *  3D Warehouse Monitoring & Bale Logistics Tracking — single-file React component
 * ============================================================================
 *  Runtime deps : react (18/19), three (r160+; uses OrbitControls + RoundedBoxGeometry)
 *  Styling      : Tailwind CSS. Dark mode is class-based — the component toggles a
 *                 `.dark` class on its own root, so Tailwind needs:
 *                   v4 → @custom-variant dark (&:where(.dark, .dark *));
 *                   v3 → darkMode: 'class'
 *
 *  File map
 *   1. Static dataset  ............ WAREHOUSE_DATA (layout + 16 fully tracked bales)
 *   2. Layout geometry ............ slot grid  — Bay → X · Shelf → Y · Row → Z
 *   3. Data pipeline .............. normalise, deterministic occupancy fill, live sim
 *   4. Formatting, hooks, icons ...
 *   5. Three.js engine ............ scene, racks, gates, trucks, picking, camera rig
 *   6. React UI ................... top bar · inventory · 3D viewport · journey
 * ============================================================================
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* ============================================================================
 * 1. STATIC DATASET
 * ----------------------------------------------------------------------------
 * `grid` is the bale's assigned 3D coordinate: bayX (lane → X), shelfY (level → Y),
 * rowZ (depth along the lane → Z). Location strings read "L-47/A/R7".
 * Timestamps are local ISO strings. With `rebaseToLiveClock`, every timestamp is
 * shifted by (now − snapshotAt) at load so the replay always looks live.
 * ========================================================================== */
const WAREHOUSE_DATA = {
  meta: {
    warehouseId: 'WH-15-1',
    warehouseName: 'Warehouse 15-1',
    facility: 'Bale Logistics Park · Sector 15',
    transitHub: 'Transit Warehouse 3 (TW-3)',
    snapshotAt: '2026-11-11T09:30:00',
    rebaseToLiveClock: true,
  },
  layout: {
    blocks: [
      { id: 'N', name: 'North Block', lanes: [1, 2, 3, 4, 5, 6, 7] },
      { id: 'S', name: 'South Block', lanes: [42, 43, 44, 45, 46, 47, 48] },
    ],
    rowsPerLane: 7,
    shelves: ['A', 'B', 'C', 'D', 'E'], // 5-level bale stacks
    targetFilledSlots: 342,
    gates: { entry: 'Entry Gate E-1', exit: 'Exit Gate X-1' },
    workingHours: { start: 6, end: 22 },
    // High-value organic fibre lots — watched for pests, humidity and intrusion.
    specialLots: [
      { id: 'HV-1', name: 'High-value cage HV-1', tag: 'ELS cotton', fiber: 'Egyptian Giza 45 ELS Cotton', lanes: [6, 7], rows: [1, 7], caged: true },
      { id: 'SL-1', name: 'Silk lot SL-1', tag: 'Silk', fiber: 'Mulberry Raw Silk', lanes: [43], rows: [1, 2] },
      { id: 'WL-1', name: 'Wool lot WL-1', tag: 'Wool', fiber: 'Merino Greasy Wool', lanes: [48], rows: [6, 7] },
    ],
  },
  bales: [
    {
      baleId: '411275167',
      lotNo: 'LOT-2610-0147',
      variety: 'Shankar-6',
      grade: 'A+',
      qualityType: 'Premium · Long Staple',
      weightKg: 170.4,
      quality: { micronaire: 4.1, stapleMm: 29.6, strengthGtex: 30.4, moisturePct: 7.1, trashPct: 1.8 },
      origin: 'Ginning Unit G-07 · Adilabad',
      status: 'STORED',
      grid: { bayX: 'L-47', shelfY: 'A', rowZ: 7 },
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-07 · Press Line 2', ts: '2026-10-29T06:42:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-07 QC Lab', ts: '2026-10-29T11:15:00', note: 'Grade A+ · Mic 4.1 · 29.6 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 2', ts: '2026-10-30T08:05:00', ref: 'Truck TS-01-UB-4417' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 4', ts: '2026-11-03T14:20:00', ref: 'Trip TR-88213' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-47/A/R7', site: 'WH 15-1 · Entry Gate E-1 → South Block', ts: '2026-11-03T21:48:00', ref: 'Forklift FL-03' },
      ],
    },
    {
      baleId: '411275168',
      lotNo: 'LOT-2610-0147',
      variety: 'Shankar-6',
      grade: 'A+',
      qualityType: 'Premium · Long Staple',
      weightKg: 168.9,
      quality: { micronaire: 4.0, stapleMm: 29.4, strengthGtex: 30.1, moisturePct: 7.3, trashPct: 1.9 },
      origin: 'Ginning Unit G-07 · Adilabad',
      status: 'STORED',
      grid: { bayX: 'L-47', shelfY: 'B', rowZ: 7 },
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-07 · Press Line 2', ts: '2026-10-29T06:51:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-07 QC Lab', ts: '2026-10-29T11:15:00', note: 'Grade A+ · Mic 4.0 · 29.4 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 2', ts: '2026-10-30T08:05:00', ref: 'Truck TS-01-UB-4417' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 4', ts: '2026-11-03T14:20:00', ref: 'Trip TR-88213' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-47/B/R7', site: 'WH 15-1 · Entry Gate E-1 → South Block', ts: '2026-11-03T22:06:00', ref: 'Forklift FL-03' },
      ],
    },
    {
      baleId: '411281902',
      lotNo: 'LOT-2611-0388',
      variety: 'MCU-5',
      grade: 'A',
      qualityType: 'Standard · Medium-Long Staple',
      weightKg: 166.2,
      quality: { micronaire: 4.3, stapleMm: 28.7, strengthGtex: 29.0, moisturePct: 7.6, trashPct: 2.2 },
      origin: 'Ginning Unit G-12 · Warangal',
      status: 'IN_TRANSIT',
      grid: null,
      eta: '2026-11-11T11:40:00',
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-12 · Press Line 1', ts: '2026-11-07T07:20:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-12 QC Lab', ts: '2026-11-07T13:40:00', note: 'Grade A · Mic 4.3 · 28.7 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 1', ts: '2026-11-08T09:12:00', ref: 'Truck TS-03-UA-1186' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 2', ts: '2026-11-11T05:10:00', ref: 'Trip TR-88407 · Truck TS-07-UC-2291' },
      ],
    },
    {
      baleId: '411281907',
      lotNo: 'LOT-2611-0388',
      variety: 'MCU-5',
      grade: 'A',
      qualityType: 'Standard · Medium-Long Staple',
      weightKg: 165.7,
      quality: { micronaire: 4.4, stapleMm: 28.5, strengthGtex: 28.8, moisturePct: 7.4, trashPct: 2.4 },
      origin: 'Ginning Unit G-12 · Warangal',
      status: 'IN_TRANSIT',
      grid: null,
      eta: '2026-11-11T11:40:00',
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-12 · Press Line 1', ts: '2026-11-07T07:34:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-12 QC Lab', ts: '2026-11-07T13:40:00', note: 'Grade A · Mic 4.4 · 28.5 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 1', ts: '2026-11-08T09:12:00', ref: 'Truck TS-03-UA-1186' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 2', ts: '2026-11-11T05:10:00', ref: 'Trip TR-88407 · Truck TS-07-UC-2291' },
      ],
    },
    {
      baleId: '411283346',
      lotNo: 'LOT-2611-0412',
      variety: 'Bunny Bt',
      grade: 'B',
      qualityType: 'Commercial · Medium Staple',
      weightKg: 162.3,
      quality: { micronaire: 4.7, stapleMm: 27.4, strengthGtex: 27.2, moisturePct: 7.9, trashPct: 2.9 },
      origin: 'Ginning Unit G-03 · Khammam',
      status: 'IN_TRANSIT',
      grid: null,
      eta: '2026-11-11T15:10:00',
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-03 · Press Line 3', ts: '2026-11-08T14:05:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-03 QC Lab', ts: '2026-11-08T18:30:00', note: 'Grade B · Mic 4.7 · 27.4 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 3', ts: '2026-11-09T10:30:00', ref: 'Truck TS-04-UD-7752' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 5', ts: '2026-11-11T08:50:00', ref: 'Trip TR-88431 · Truck TS-09-UE-3308' },
      ],
    },
    {
      baleId: '411290033',
      lotNo: 'LOT-2611-0291',
      variety: 'DCH-32',
      grade: 'A+',
      qualityType: 'Premium · Long Staple',
      weightKg: 171.1,
      quality: { micronaire: 3.9, stapleMm: 30.8, strengthGtex: 31.6, moisturePct: 6.9, trashPct: 1.5 },
      origin: 'Ginning Unit G-21 · Nagpur',
      status: 'RECEIVING',
      grid: null,
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-21 · Press Line 1', ts: '2026-11-06T10:12:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-21 QC Lab', ts: '2026-11-06T15:02:00', note: 'Grade A+ · Mic 3.9 · 30.8 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 2', ts: '2026-11-07T08:40:00', ref: 'Truck TS-06-UB-5520' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 1', ts: '2026-11-11T03:15:00', ref: 'Trip TR-88398' },
        { event: 'WH_IN', title: 'Arrived at Warehouse 15-1', site: 'WH 15-1 · Entry Gate E-1 · Receiving Bay', ts: '2026-11-11T08:55:00', note: 'Weighbridge OK · awaiting put-away slot' },
      ],
    },
    {
      baleId: '411264410',
      lotNo: 'LOT-2610-0071',
      variety: 'Bunny Bt',
      grade: 'B',
      qualityType: 'Commercial · Medium Staple',
      weightKg: 163.8,
      quality: { micronaire: 4.8, stapleMm: 27.1, strengthGtex: 26.9, moisturePct: 9.4, trashPct: 3.1 },
      origin: 'Ginning Unit G-03 · Khammam',
      status: 'QC_HOLD',
      grid: { bayX: 'L-3', shelfY: 'A', rowZ: 2 },
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-03 · Press Line 1', ts: '2026-10-18T09:02:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-03 QC Lab', ts: '2026-10-18T14:20:00', note: 'Grade B · Mic 4.8 · 27.1 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 1', ts: '2026-10-19T07:55:00', ref: 'Truck TS-02-UC-6034' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 3', ts: '2026-10-24T12:30:00', ref: 'Trip TR-87952' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-3/A/R2', site: 'WH 15-1 · Entry Gate E-1 → North Block', ts: '2026-10-24T19:30:00', ref: 'Forklift FL-01' },
        { event: 'QC_HOLD', title: 'Placed on QC Hold', site: 'WH 15-1 · Floor QC Patrol', ts: '2026-11-09T16:45:00', note: 'Moisture 9.4% exceeds 8.5% limit — re-test scheduled' },
      ],
    },
    {
      baleId: '411258821',
      lotNo: 'LOT-2610-0012',
      variety: 'Shankar-6',
      grade: 'A',
      qualityType: 'Standard · Medium-Long Staple',
      weightKg: 167.5,
      quality: { micronaire: 4.2, stapleMm: 28.9, strengthGtex: 29.3, moisturePct: 7.2, trashPct: 2.0 },
      origin: 'Ginning Unit G-07 · Adilabad',
      status: 'DISPATCHED',
      grid: null,
      lastGrid: { bayX: 'L-44', shelfY: 'C', rowZ: 1 },
      destination: 'Spinning Mill M-04 · Coimbatore',
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-07 · Press Line 3', ts: '2026-10-10T08:15:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-07 QC Lab', ts: '2026-10-10T13:05:00', note: 'Grade A · Mic 4.2 · 28.9 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 2', ts: '2026-10-11T09:40:00', ref: 'Truck TS-01-UA-2210' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 4', ts: '2026-10-15T16:10:00', ref: 'Trip TR-87611' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-44/C/R1', site: 'WH 15-1 · Entry Gate E-1 → South Block', ts: '2026-10-15T23:20:00', ref: 'Forklift FL-05' },
        { event: 'PICKED', title: 'Picked from L-44/C/R1', site: 'WH 15-1 · South Block', ts: '2026-11-10T18:20:00', ref: 'Order SO-15-7781' },
        { event: 'DISPATCHED', title: 'Exited Warehouse 15-1', site: 'WH 15-1 · Exit Gate X-1', ts: '2026-11-10T19:05:00', note: 'To Spinning Mill M-04 · Coimbatore', ref: 'Invoice INV-15-20931' },
      ],
    },
    {
      baleId: '411245120',
      lotNo: 'LOT-2609-0533',
      variety: 'H-4',
      grade: 'A+',
      qualityType: 'Premium · Long Staple',
      weightKg: 172.0,
      quality: { micronaire: 3.9, stapleMm: 30.2, strengthGtex: 31.0, moisturePct: 6.8, trashPct: 1.6 },
      origin: 'Ginning Unit G-21 · Nagpur',
      status: 'DISPATCHED',
      grid: null,
      lastGrid: { bayX: 'L-1', shelfY: 'C', rowZ: 1 },
      destination: 'Export Hub EX-1 · Mundra Port',
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-21 · Press Line 2', ts: '2026-09-28T07:10:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-21 QC Lab', ts: '2026-09-28T12:00:00', note: 'Grade A+ · Mic 3.9 · 30.2 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 3', ts: '2026-09-29T10:05:00', ref: 'Truck TS-05-UE-9046' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 6', ts: '2026-10-03T15:45:00', ref: 'Trip TR-87215' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-1/C/R1', site: 'WH 15-1 · Entry Gate E-1 → North Block', ts: '2026-10-03T22:30:00', ref: 'Forklift FL-02' },
        { event: 'PICKED', title: 'Picked from L-1/C/R1', site: 'WH 15-1 · North Block', ts: '2026-11-09T07:40:00', ref: 'Order SO-15-7744' },
        { event: 'DISPATCHED', title: 'Exited Warehouse 15-1', site: 'WH 15-1 · Exit Gate X-1', ts: '2026-11-09T08:15:00', note: 'To Export Hub EX-1 · Mundra Port', ref: 'Invoice INV-15-20877' },
      ],
    },
    {
      baleId: '411252007',
      lotNo: 'LOT-2609-0204',
      variety: 'J-34',
      grade: 'B',
      qualityType: 'Commercial · Medium Staple',
      weightKg: 161.4,
      quality: { micronaire: 4.6, stapleMm: 26.8, strengthGtex: 26.5, moisturePct: 7.7, trashPct: 3.4 },
      origin: 'Ginning Unit G-15 · Rajkot',
      status: 'STORED',
      grid: { bayX: 'L-1', shelfY: 'E', rowZ: 7 },
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-15 · Press Line 1', ts: '2026-09-14T08:30:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-15 QC Lab', ts: '2026-09-14T13:10:00', note: 'Grade B · Mic 4.6 · 26.8 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 1', ts: '2026-09-15T09:00:00', ref: 'Truck TS-08-UA-3317' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 2', ts: '2026-09-22T11:20:00', ref: 'Trip TR-86874' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-1/E/R7', site: 'WH 15-1 · Entry Gate E-1 → North Block', ts: '2026-09-22T20:10:00', ref: 'Forklift FL-04' },
      ],
    },
    {
      baleId: '411270555',
      lotNo: 'LOT-2610-0262',
      variety: 'Shankar-6',
      grade: 'A',
      qualityType: 'Standard · Medium-Long Staple',
      weightKg: 166.9,
      quality: { micronaire: 4.2, stapleMm: 28.6, strengthGtex: 29.1, moisturePct: 7.0, trashPct: 2.1 },
      origin: 'Ginning Unit G-12 · Warangal',
      status: 'STORED',
      grid: { bayX: 'L-5', shelfY: 'C', rowZ: 4 },
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-12 · Press Line 2', ts: '2026-10-21T06:55:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-12 QC Lab', ts: '2026-10-21T12:10:00', note: 'Grade A · Mic 4.2 · 28.6 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 2', ts: '2026-10-22T08:30:00', ref: 'Truck TS-03-UD-4471' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 1', ts: '2026-10-27T13:40:00', ref: 'Trip TR-87866' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-6/C/R4', site: 'WH 15-1 · Entry Gate E-1 → North Block', ts: '2026-10-27T23:05:00', ref: 'Forklift FL-06' },
        { event: 'RELOCATED', title: 'Relocated L-6/C/R4 → L-5/C/R4', site: 'WH 15-1 · North Block', ts: '2026-11-05T10:20:00', note: 'Rack L-6 beam inspection', ref: 'Forklift FL-02' },
      ],
    },
    {
      baleId: '411277310',
      lotNo: 'LOT-2611-0019',
      variety: 'DCH-32',
      grade: 'A',
      qualityType: 'Standard · Medium-Long Staple',
      weightKg: 168.0,
      quality: { micronaire: 4.0, stapleMm: 29.0, strengthGtex: 29.6, moisturePct: 7.2, trashPct: 1.9 },
      origin: 'Ginning Unit G-21 · Nagpur',
      status: 'STORED',
      grid: { bayX: 'L-42', shelfY: 'A', rowZ: 1 },
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-21 · Press Line 3', ts: '2026-11-01T07:45:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-21 QC Lab', ts: '2026-11-01T12:30:00', note: 'Grade A · Mic 4.0 · 29.0 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 1', ts: '2026-11-02T09:20:00', ref: 'Truck TS-06-UC-8803' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 3', ts: '2026-11-06T13:15:00', ref: 'Trip TR-88290' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-42/A/R1', site: 'WH 15-1 · Entry Gate E-1 → South Block', ts: '2026-11-06T20:40:00', ref: 'Forklift FL-01' },
      ],
    },
    {
      baleId: '411277311',
      lotNo: 'LOT-2611-0019',
      variety: 'DCH-32',
      grade: 'A',
      qualityType: 'Standard · Medium-Long Staple',
      weightKg: 167.6,
      quality: { micronaire: 4.1, stapleMm: 28.8, strengthGtex: 29.4, moisturePct: 7.3, trashPct: 2.0 },
      origin: 'Ginning Unit G-21 · Nagpur',
      status: 'STORED',
      grid: { bayX: 'L-42', shelfY: 'B', rowZ: 1 },
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-21 · Press Line 3', ts: '2026-11-01T07:58:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-21 QC Lab', ts: '2026-11-01T12:30:00', note: 'Grade A · Mic 4.1 · 28.8 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 1', ts: '2026-11-02T09:20:00', ref: 'Truck TS-06-UC-8803' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 3', ts: '2026-11-06T13:15:00', ref: 'Trip TR-88290' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-42/B/R1', site: 'WH 15-1 · Entry Gate E-1 → South Block', ts: '2026-11-06T20:52:00', ref: 'Forklift FL-01' },
      ],
    },
    {
      baleId: '411279964',
      lotNo: 'LOT-2611-0102',
      variety: 'MCU-5',
      grade: 'A+',
      qualityType: 'Premium · Long Staple',
      weightKg: 169.8,
      quality: { micronaire: 4.0, stapleMm: 29.9, strengthGtex: 30.7, moisturePct: 7.0, trashPct: 1.7 },
      origin: 'Ginning Unit G-12 · Warangal',
      status: 'STORED',
      grid: { bayX: 'L-4', shelfY: 'B', rowZ: 6 },
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-12 · Press Line 1', ts: '2026-11-03T06:30:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-12 QC Lab', ts: '2026-11-03T11:45:00', note: 'Grade A+ · Mic 4.0 · 29.9 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 2', ts: '2026-11-04T08:50:00', ref: 'Truck TS-03-UB-6612' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 4', ts: '2026-11-08T11:00:00', ref: 'Trip TR-88352' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-4/B/R6', site: 'WH 15-1 · Entry Gate E-1 → North Block', ts: '2026-11-08T18:25:00', ref: 'Forklift FL-04' },
      ],
    },
    {
      baleId: '411266781',
      lotNo: 'LOT-2610-0093',
      variety: 'Suraj',
      grade: 'C',
      qualityType: 'Off-grade · Short Staple',
      weightKg: 158.6,
      quality: { micronaire: 5.1, stapleMm: 25.6, strengthGtex: 24.9, moisturePct: 8.1, trashPct: 4.2 },
      origin: 'Ginning Unit G-15 · Rajkot',
      status: 'STORED',
      grid: { bayX: 'L-45', shelfY: 'E', rowZ: 6 },
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-15 · Press Line 2', ts: '2026-10-19T10:20:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-15 QC Lab', ts: '2026-10-19T15:40:00', note: 'Grade C · Mic 5.1 · 25.6 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 3', ts: '2026-10-20T09:30:00', ref: 'Truck TS-08-UE-1490' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 6', ts: '2026-10-26T12:00:00', ref: 'Trip TR-87801' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-45/E/R6', site: 'WH 15-1 · Entry Gate E-1 → South Block', ts: '2026-10-26T21:15:00', ref: 'Forklift FL-05' },
      ],
    },
    {
      baleId: '411273399',
      lotNo: 'LOT-2610-0318',
      variety: 'Bunny Bt',
      grade: 'B',
      qualityType: 'Commercial · Medium Staple',
      weightKg: 163.1,
      quality: { micronaire: 4.6, stapleMm: 27.6, strengthGtex: 27.4, moisturePct: 7.5, trashPct: 2.7 },
      origin: 'Ginning Unit G-03 · Khammam',
      status: 'STORED',
      grid: { bayX: 'L-2', shelfY: 'A', rowZ: 3 },
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-03 · Press Line 2', ts: '2026-10-26T09:10:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-03 QC Lab', ts: '2026-10-26T13:55:00', note: 'Grade B · Mic 4.6 · 27.6 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 1', ts: '2026-10-27T10:15:00', ref: 'Truck TS-04-UA-2054' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 5', ts: '2026-10-31T16:30:00', ref: 'Trip TR-88037' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-2/A/R3', site: 'WH 15-1 · Entry Gate E-1 → North Block', ts: '2026-11-01T00:40:00', ref: 'Forklift FL-06' },
      ],
    },
    /* ---- Bales that anchor live safety incidents ---- */
    {
      baleId: '411268450',
      lotNo: 'LOT-2610-0219',
      variety: 'Shankar-6',
      fiber: 'Cotton',
      grade: 'B',
      qualityType: 'Commercial · Medium Staple',
      weightKg: 165.2,
      quality: { micronaire: 4.9, stapleMm: 27.2, strengthGtex: 27.0, moisturePct: 9.1, trashPct: 3.0 },
      origin: 'Ginning Unit G-07 · Adilabad',
      status: 'STORED',
      grid: { bayX: 'L-46', shelfY: 'C', rowZ: 3 },
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-07 · Press Line 1', ts: '2026-10-22T08:40:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-07 QC Lab', ts: '2026-10-22T13:30:00', note: 'Grade B · Mic 4.9 · moisture 9.1 % (borderline)' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 3', ts: '2026-10-23T09:10:00', ref: 'Truck TS-02-UA-7718' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 2', ts: '2026-10-28T15:20:00', ref: 'Trip TR-87903' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-46/C/R3', site: 'WH 15-1 · Entry Gate E-1 → South Block', ts: '2026-10-28T22:45:00', ref: 'Forklift FL-02' },
      ],
    },
    {
      baleId: '411262118',
      lotNo: 'LOT-2610-0377',
      variety: 'MCU-5',
      fiber: 'Cotton',
      grade: 'A',
      qualityType: 'Standard · Medium-Long Staple',
      weightKg: 166.8,
      quality: { micronaire: 4.3, stapleMm: 28.4, strengthGtex: 28.9, moisturePct: 8.4, trashPct: 2.3 },
      origin: 'Ginning Unit G-12 · Warangal',
      status: 'STORED',
      grid: { bayX: 'L-4', shelfY: 'B', rowZ: 5 },
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-12 · Press Line 3', ts: '2026-10-30T07:15:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-12 QC Lab', ts: '2026-10-30T12:40:00', note: 'Grade A · Mic 4.3 · 28.4 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 1', ts: '2026-10-31T08:55:00', ref: 'Truck TS-05-UC-3392' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 3', ts: '2026-11-04T13:10:00', ref: 'Trip TR-88241' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-4/B/R5', site: 'WH 15-1 · Entry Gate E-1 → North Block', ts: '2026-11-04T20:15:00', ref: 'Forklift FL-04' },
      ],
    },
    {
      baleId: '411285530',
      lotNo: 'LOT-2609-EG45',
      variety: 'Giza 45',
      fiber: 'Egyptian Giza 45 ELS Cotton',
      grade: 'A+',
      qualityType: 'Extra-Long Staple · Imported',
      weightKg: 182.0,
      quality: { micronaire: 3.6, stapleMm: 35.4, strengthGtex: 44.1, moisturePct: 6.8, trashPct: 0.9 },
      origin: 'Import Lot · Alexandria, Egypt',
      status: 'STORED',
      grid: { bayX: 'L-7', shelfY: 'D', rowZ: 4 },
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Alexandria Ginning Co. · Press 4', ts: '2026-09-18T09:00:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'CATGO Lab · Alexandria', ts: '2026-09-19T11:30:00', note: 'Giza 45 · Mic 3.6 · 35.4 mm extra-long staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Bonded Bay 1', ts: '2026-10-08T10:20:00', ref: 'Container MSKU 774120-3 via Mundra Port' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 1', ts: '2026-10-12T14:00:00', ref: 'Trip TR-87460 · escorted' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-7/D/R4', site: 'WH 15-1 · Entry Gate E-1 → HV-1 cage', ts: '2026-10-12T21:35:00', ref: 'Forklift FL-01' },
      ],
    },
    {
      baleId: '411286014',
      lotNo: 'LOT-2610-WL21',
      variety: 'Merino 21.5 µm',
      fiber: 'Merino Greasy Wool',
      grade: 'A',
      qualityType: 'Fine Wool · Greasy',
      weightKg: 192.0,
      quality: { micronaire: 21.5, stapleMm: 78, strengthGtex: 38, moisturePct: 11.6, trashPct: 1.2 },
      origin: 'Import Lot · Fremantle, Australia',
      status: 'STORED',
      grid: { bayX: 'L-48', shelfY: 'A', rowZ: 6 },
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Wool Press · Fremantle Store 2', ts: '2026-09-25T08:10:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (AWTA)', site: 'AWTA Lab · Fremantle', ts: '2026-09-26T10:45:00', note: '21.5 µm · 78 mm staple · VM 1.2 %' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Bonded Bay 2', ts: '2026-10-20T09:30:00', ref: 'Container TGHU 551902-7' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 4', ts: '2026-10-24T13:15:00', ref: 'Trip TR-87788' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-48/A/R6', site: 'WH 15-1 · Entry Gate E-1 → Wool lot WL-1', ts: '2026-10-24T22:10:00', ref: 'Forklift FL-03' },
      ],
    },
    {
      baleId: '411284471',
      lotNo: 'LOT-2610-0402',
      variety: 'Bunny Bt',
      fiber: 'Cotton',
      grade: 'B',
      qualityType: 'Commercial · Medium Staple',
      weightKg: 164.4,
      quality: { micronaire: 4.7, stapleMm: 27.5, strengthGtex: 27.3, moisturePct: 7.8, trashPct: 2.8 },
      origin: 'Ginning Unit G-03 · Khammam',
      status: 'STORED',
      grid: { bayX: 'L-43', shelfY: 'D', rowZ: 3 },
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-03 · Press Line 2', ts: '2026-10-24T10:05:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-03 QC Lab', ts: '2026-10-24T15:20:00', note: 'Grade B · Mic 4.7 · 27.5 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 2', ts: '2026-10-25T09:40:00', ref: 'Truck TS-04-UB-6120' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 5', ts: '2026-10-30T16:00:00', ref: 'Trip TR-88011' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-43/D/R3', site: 'WH 15-1 · Entry Gate E-1 → South Block', ts: '2026-10-30T23:50:00', ref: 'Forklift FL-05' },
      ],
    },
    {
      baleId: '411263390',
      lotNo: 'LOT-2610-0155',
      variety: 'DCH-32',
      fiber: 'Cotton',
      grade: 'A',
      qualityType: 'Standard · Medium-Long Staple',
      weightKg: 168.4,
      quality: { micronaire: 4.1, stapleMm: 28.8, strengthGtex: 29.5, moisturePct: 7.3, trashPct: 2.0 },
      origin: 'Ginning Unit G-21 · Nagpur',
      status: 'STORED',
      grid: { bayX: 'L-44', shelfY: 'E', rowZ: 5 },
      history: [
        { event: 'PRODUCED', title: 'Bale Production', site: 'Ginning Unit G-21 · Press Line 2', ts: '2026-10-14T07:50:00' },
        { event: 'QC_GRADED', title: 'Quality Graded (HVI)', site: 'G-21 QC Lab', ts: '2026-10-14T12:15:00', note: 'Grade A · Mic 4.1 · 28.8 mm staple' },
        { event: 'TW_IN', title: 'Entered Transit Warehouse 3', site: 'TW-3 · Inbound Gate 3', ts: '2026-10-15T08:20:00', ref: 'Truck TS-06-UD-4129' },
        { event: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: 'TW-3 · Dispatch Dock 6', ts: '2026-10-20T14:30:00', ref: 'Trip TR-87700' },
        { event: 'STORED', title: 'Entered Warehouse 15-1 at L-44/E/R5', site: 'WH 15-1 · Entry Gate E-1 → South Block', ts: '2026-10-20T21:30:00', ref: 'Forklift FL-02' },
      ],
    },
  ],

  /* --------------------------------------------------------------------------
   * Safety & risk telemetry. Positions are in metres from the warehouse centre
   * (+x east, +z south) or given by lane/row. `detectedAt` timestamps follow the
   * same live-clock rebasing as the bale history.
   * ------------------------------------------------------------------------ */
  safety: {
    thresholds: {
      coreTemp: { warn: 45, crit: 55 },
      rhHigh: { warn: 85, crit: 92 },
      rhLow: { warn: 30, crit: 22 },
      tilt: { warn: 3, crit: 4.5 },
      strapTension: { min: 2.5, nominal: 4.2 },
      rssiLost: -90,
    },
    zones: [
      { id: 'N-W', name: 'North-West racks', lanes: [1, 2, 3], suppression: 'Water mist', detector: 'LB-NW', rh: 58 },
      { id: 'N-E', name: 'North-East racks', lanes: [4, 5, 6, 7], suppression: 'Water mist', detector: 'LB-NE', rh: 61 },
      { id: 'S-W', name: 'South-West racks', lanes: [42, 43, 44], suppression: 'Water mist', detector: 'LB-SW', rh: 64 },
      { id: 'S-E', name: 'South-East racks', lanes: [45, 46, 47, 48], suppression: 'Water mist', detector: 'LB-SE', rh: 87 },
      { id: 'AISLE', name: 'Main drive aisle', suppression: 'Wet-pipe sprinkler', detector: 'LB-MA', rh: 55 },
      { id: 'RCV', name: 'Receiving bay E-1', suppression: 'Pre-action sprinkler', detector: 'LB-RC', rh: 49 },
      { id: 'DSP', name: 'Dispatch staging X-1', suppression: 'Pre-action sprinkler', detector: 'LB-DS', rh: 27 },
    ],
    traps: [
      { id: 1, where: 'North wall', x: -15.5, z: -15.55 },
      { id: 2, where: 'North wall', x: -6.5, z: -15.55 },
      { id: 3, where: 'North wall', x: 6.5, z: -15.55 },
      { id: 4, where: 'North wall', x: 15.5, z: -15.55 },
      { id: 5, where: 'South wall', x: -15.5, z: 15.55 },
      { id: 6, where: 'South wall', x: -6.5, z: 15.55 },
      { id: 7, where: 'South wall', x: 6.5, z: 15.55 },
      { id: 8, where: 'South wall', x: 15.5, z: 15.55 },
      { id: 9, where: 'West wall', x: -17.05, z: -10 },
      { id: 10, where: 'West wall', x: -17.05, z: 10 },
      { id: 11, where: 'East wall', x: 17.05, z: -10 },
      { id: 12, where: 'East wall', x: 17.05, z: 10 },
      { id: 13, where: 'Rack base L-1/R4', lane: 1, row: 4 },
      { id: 14, where: 'Rack base L-46/R5', lane: 46, row: 5 },
      { id: 15, where: 'Rack base L-3/R2', lane: 3, row: 2 },
      { id: 16, where: 'Rack base L-5/R6', lane: 5, row: 6 },
      { id: 17, where: 'Rack base L-7/R2 (HV-1)', lane: 7, row: 2 },
      { id: 18, where: 'Rack base L-42/R3', lane: 42, row: 3 },
      { id: 19, where: 'Rack base L-44/R6', lane: 44, row: 6 },
      { id: 20, where: 'Rack base L-48/R6 (WL-1)', lane: 48, row: 6 },
      { id: 21, where: 'Rack base L-43/R1 (SL-1)', lane: 43, row: 1 },
      { id: 22, where: 'Rack base L-6/R5 (HV-1)', lane: 6, row: 5 },
      { id: 23, where: 'Receiving bay', x: -15.3, z: 6.6 },
      { id: 24, where: 'Dispatch staging', x: 15.3, z: 6.6 },
    ],
    hydrants: [
      { id: 'H-1', x: -12.6, z: -14.4 },
      { id: 'H-2', x: 12.6, z: -14.4 },
      { id: 'H-3', x: -12.6, z: 14.4 },
      { id: 'H-4', x: 9.0, z: 14.4 },
      { id: 'H-5', x: -17.05, z: 5.6 },
      { id: 'H-6', x: 17.05, z: -5.6 },
    ],
    exits: [
      { id: 'EX-N1', x: -3.6, z: -16 },
      { id: 'EX-N2', x: 3.6, z: -16 },
      { id: 'EX-S1', x: -3.6, z: 16 },
      { id: 'EX-S2', x: 3.6, z: 16 },
    ],
    beams: [
      { id: 'B-1', side: 'front' },
      { id: 'B-2', side: 'west' },
      { id: 'B-3', side: 'east' },
      { id: 'B-4', side: 'rear' },
    ],
    docks: [
      { id: 'E-1', type: 'Inbound', truck: 'TS-07-UC-2291', state: 'Unloading', order: 'Trip TR-88407' },
      { id: 'X-1', type: 'Outbound', truck: 'TS-09-UE-3308', state: 'Loading', order: 'SO-15-7790' },
    ],
    fleet: [
      { id: 'FL-01', kind: 'Forklift', state: 'Working', wo: 'WO-15-3381', task: 'Put-away · receiving → N-W' },
      { id: 'FL-02', kind: 'Forklift', state: 'Working', wo: 'WO-15-3384', task: 'Replenish dispatch staging' },
      { id: 'FL-03', kind: 'Forklift', state: 'Idle', wo: null, task: 'Parked · charging bay' },
      { id: 'FL-04', kind: 'Forklift', state: 'Charging', wo: null, task: 'Battery 34 %' },
      { id: 'FL-05', kind: 'Forklift', state: 'Hold', wo: 'WO-15-3390', task: 'Held at X-1 · manifest check' },
      { id: 'FL-06', kind: 'Forklift', state: 'Idle', wo: null, task: 'Parked · charging bay' },
      { id: 'AGV-1', kind: 'AGV', state: 'Working', wo: 'WO-15-3386', task: 'Pallet shuttle · main aisle' },
      { id: 'AGV-2', kind: 'AGV', state: 'Idle', wo: null, task: 'Docked at X-1' },
    ],
    incidents: [
      {
        id: 'INC-1101',
        category: 'FIRE',
        type: 'THERMAL',
        severity: 'CRITICAL',
        status: 'OPEN',
        title: 'Core temperature spike — self-heating bale',
        detail: 'Rack thermal camera TC-46-C reads 58.7 °C at the core of bale 411268450 (limit 55 °C), climbing about 3 °C per hour. Intake moisture was 9.1 % — a classic spontaneous-combustion profile.',
        baleId: '411268450',
        zone: 'S-E',
        target: { slot: 'L-46/C/R3' },
        sensor: { id: 'TC-46-C', kind: 'Rack thermal camera', metric: 'coreTemp', value: 58.7, unit: '°C', limit: 55, ratePerHour: 3.1 },
        detectedAt: '2026-11-11T07:52:00',
        audit: [
          { ts: '2026-11-11T07:52:00', actor: 'TC-46-C', text: 'Core temperature crossed 55 °C (55.4 °C)' },
          { ts: '2026-11-11T07:53:00', actor: 'Fire panel', text: 'Water-mist zone S-East primed (ACTIVE)' },
        ],
      },
      {
        id: 'INC-1102',
        category: 'FIRE',
        type: 'THERMAL',
        severity: 'WARNING',
        status: 'OPEN',
        title: 'Elevated core temperature',
        detail: 'Thermal camera TC-04-B reads 47.2 °C in bale 411262118 (watch level 45 °C). The trend is slow (+0.6 °C/h); keep it under observation.',
        baleId: '411262118',
        zone: 'N-E',
        target: { slot: 'L-4/B/R5' },
        sensor: { id: 'TC-04-B', kind: 'Rack thermal camera', metric: 'coreTemp', value: 47.2, unit: '°C', limit: 45, ratePerHour: 0.6 },
        detectedAt: '2026-11-11T08:40:00',
        audit: [{ ts: '2026-11-11T08:40:00', actor: 'TC-04-B', text: 'Core temperature crossed 45 °C watch level' }],
      },
      {
        id: 'INC-1103',
        category: 'FIRE',
        type: 'RH_HIGH',
        severity: 'WARNING',
        status: 'OPEN',
        title: 'Humidity 87 % — mould & fibre-rot risk',
        detail: 'RH probes in zone S-East average 87 % (limit 85 %) after overnight rain ingress at the rear louvres. Sustained high humidity rots cotton and wool and attracts pests.',
        zone: 'S-E',
        target: { zone: 'S-E' },
        sensor: { id: 'RH-SE-2', kind: 'RH probe array', metric: 'rh', value: 87, unit: '%', limit: 85 },
        detectedAt: '2026-11-11T05:10:00',
        audit: [{ ts: '2026-11-11T05:10:00', actor: 'RH-SE-2', text: 'Zone RH above 85 % for 30 min' }],
      },
      {
        id: 'INC-1104',
        category: 'FIRE',
        type: 'RH_LOW',
        severity: 'WARNING',
        status: 'OPEN',
        title: 'Dry air 27 % RH — static ignition risk',
        detail: 'Dispatch staging RH dropped to 27 % (limit 30 %) with dock doors open and space heaters running. Dry air raises static-discharge risk around loose lint.',
        zone: 'DSP',
        target: { zone: 'DSP' },
        sensor: { id: 'RH-DS-1', kind: 'RH probe', metric: 'rh', value: 27, unit: '%', limit: 30 },
        detectedAt: '2026-11-11T09:05:00',
        audit: [{ ts: '2026-11-11T09:05:00', actor: 'RH-DS-1', text: 'Zone RH below 30 %' }],
      },
      {
        id: 'INC-1105',
        category: 'FIRE',
        type: 'BLOCKAGE',
        severity: 'WARNING',
        status: 'OPEN',
        title: 'Access aisle L-47 obstructed',
        detail: 'Aisle camera CAM-A47 sees empty pallets and cartons (≈ 2.4 m²) in the access aisle beside L-47, rows R4–R5. They block the escape path and the hose route to hydrant H-4.',
        zone: 'S-E',
        hydrant: 'H-4',
        target: { aisle: { lane: 47, rows: [4, 5] } },
        sensor: { id: 'CAM-A47', kind: 'Aisle CV camera', metric: 'clutter', value: 2.4, unit: 'm²', limit: 0 },
        detectedAt: '2026-11-11T08:58:00',
        audit: [{ ts: '2026-11-11T08:58:00', actor: 'CAM-A47', text: 'Obstruction classified: pallets / cartons (confidence 0.94)' }],
      },
      {
        id: 'INC-1106',
        category: 'FIRE',
        type: 'SMOKE',
        severity: 'INFO',
        status: 'OPEN',
        title: 'Laser smoke detector alignment drift',
        detail: 'Beam detector LB-SW shows a 0.6 %/m baseline obscuration — reflector drift, not smoke. Realign it to avoid nuisance alarms.',
        zone: 'S-W',
        target: { zone: 'S-W' },
        sensor: { id: 'LB-SW', kind: 'Laser beam smoke detector', metric: 'obscuration', value: 0.6, unit: '%/m', limit: 2.5 },
        detectedAt: '2026-11-11T03:30:00',
        audit: [{ ts: '2026-11-11T03:30:00', actor: 'LB-SW', text: 'Baseline drift above 0.5 %/m' }],
      },
      {
        id: 'INC-1201',
        category: 'PEST',
        type: 'TRAP',
        severity: 'WARNING',
        status: 'OPEN',
        title: 'Trap #14 triggered near Row L-46',
        detail: 'Snap trap #14 at the rack base of L-46/R5 fired at 04:18. Its infrared sensor logged 3 movement events in the 20 minutes before.',
        zone: 'S-E',
        target: { trap: 14 },
        sensor: { id: 'TRAP-14', kind: 'IoT snap trap + IR', metric: 'events', value: 3, unit: 'IR events', limit: 0 },
        detectedAt: '2026-11-11T04:18:00',
        audit: [{ ts: '2026-11-11T04:18:00', actor: 'TRAP-14', text: 'Trap fired · capture likely' }],
      },
      {
        id: 'INC-1202',
        category: 'PEST',
        type: 'NESTING',
        severity: 'CRITICAL',
        status: 'OPEN',
        title: 'Rodent activity at wool lot WL-1 — nesting risk',
        detail: 'Trap #20 infrared sensor logged 11 movement events overnight beside high-value Merino wool, and the acoustic sensor picked up gnawing. With 87 % RH in S-East, nesting and fibre-degradation risk is high.',
        baleId: '411286014',
        zone: 'S-E',
        lot: 'WL-1',
        trap: 20,
        target: { slot: 'L-48/A/R6' },
        sensor: { id: 'IR-20', kind: 'IR motion + acoustic', metric: 'events', value: 11, unit: 'events / night', limit: 2 },
        detectedAt: '2026-11-11T06:05:00',
        audit: [
          { ts: '2026-11-11T06:05:00', actor: 'IR-20', text: '11 motion events since 22:00 · gnawing signature' },
          { ts: '2026-11-11T06:06:00', actor: 'Risk engine', text: 'Escalated: pest activity next to high-value fibre lot WL-1' },
        ],
      },
      {
        id: 'INC-1203',
        category: 'PEST',
        type: 'TRAP_SERVICE',
        severity: 'INFO',
        status: 'OPEN',
        title: 'Trap #07 battery at 9 %',
        detail: 'Perimeter trap #07 on the south wall will go offline within about 24 hours.',
        target: { trap: 7 },
        sensor: { id: 'TRAP-07', kind: 'IoT snap trap', metric: 'battery', value: 9, unit: '%', limit: 20 },
        detectedAt: '2026-11-11T00:30:00',
        audit: [{ ts: '2026-11-11T00:30:00', actor: 'TRAP-07', text: 'Battery below 10 %' }],
      },
      {
        id: 'INC-1301',
        category: 'SECURITY',
        type: 'BEAM_BREACH',
        severity: 'CRITICAL',
        status: 'ACKNOWLEDGED',
        title: 'IR beam B-3 breached — HV-1 cage',
        detail: 'The east laser curtain of the Egyptian ELS cotton cage was broken at 02:14, outside working hours (06:00–22:00). No access badge or forklift work order is on record.',
        zone: 'N-E',
        lot: 'HV-1',
        target: { beam: 'B-3' },
        sensor: { id: 'IRB-B3', kind: 'Perimeter IR beam', metric: 'beam', value: 41, unit: 's interrupted', limit: 0 },
        detectedAt: '2026-11-11T02:14:00',
        doneSteps: [{ i: 0, ts: '2026-11-11T02:19:00', by: 'Night security · Guard post 2' }],
        audit: [
          { ts: '2026-11-11T02:14:00', actor: 'IRB-B3', text: 'Beam curtain interrupted for 41 s' },
          { ts: '2026-11-11T02:16:00', actor: 'Night security', text: 'Acknowledged — guard dispatched' },
          { ts: '2026-11-11T02:19:00', actor: 'Guard post 2', text: 'Step 1 done: guard on site, cage door found closed' },
        ],
      },
      {
        id: 'INC-1302',
        category: 'SECURITY',
        type: 'RFID_LOST',
        severity: 'CRITICAL',
        status: 'OPEN',
        title: 'RFID tag lost — unauthorised removal suspected',
        detail: 'BLE tag TAG-285530 stopped reporting at 02:16, two minutes after the B-3 beam breach. Last seen at −61 dBm in L-7/D/R4. No forklift work order is assigned to this bale.',
        baleId: '411285530',
        zone: 'N-E',
        lot: 'HV-1',
        target: { slot: 'L-7/D/R4' },
        sensor: { id: 'RFID-GW-07', kind: 'RFID / BLE gateway', metric: 'rssi', value: null, unit: 'dBm', limit: -90 },
        detectedAt: '2026-11-11T02:16:00',
        audit: [
          { ts: '2026-11-11T02:16:00', actor: 'RFID-GW-07', text: 'Tag TAG-285530 silent > 90 s outside working hours' },
          { ts: '2026-11-11T02:17:00', actor: 'WMS', text: 'No forklift work order for bale 411285530' },
        ],
      },
      {
        id: 'INC-1303',
        category: 'SECURITY',
        type: 'DOCK_MISMATCH',
        severity: 'WARNING',
        status: 'OPEN',
        title: 'Mismatched bale at Dock X-1 — loading halted',
        detail: 'FL-05 presented bale 411266781 (Grade C, from L-45/E/R6) for truck TS-09-UE-3308 on order SO-15-7790, whose manifest lists Grade A lot LOT-2611-0019 only. The dock interlock halted loading and the bale went back to its slot.',
        baleId: '411266781',
        zone: 'DSP',
        target: { dock: 'X-1' },
        sensor: { id: 'DOCK-X1-RFID', kind: 'Dock RFID portal', metric: 'scan', value: 1, unit: 'mismatch', limit: 0 },
        detectedAt: '2026-11-11T09:12:00',
        audit: [{ ts: '2026-11-11T09:12:00', actor: 'DOCK-X1-RFID', text: 'Scanned ID not on manifest SO-15-7790 · interlock engaged' }],
      },
      {
        id: 'INC-1401',
        category: 'STRUCTURAL',
        type: 'TILT',
        severity: 'CRITICAL',
        status: 'OPEN',
        title: 'Stack L-44/R5 leaning 4.6° — collapse risk',
        detail: 'Micro-gyro GY-44-05 on this 5-level stack reads a 4.6° lean towards the access aisle (limit 3.0°), up 0.4° in the last hour. The base pallet is likely crushed.',
        baleId: '411263390',
        zone: 'S-W',
        target: { column: { lane: 44, row: 5 } },
        sensor: { id: 'GY-44-05', kind: 'Micro-gyro tilt sensor', metric: 'tilt', value: 4.6, unit: '°', limit: 3, ratePerHour: 0.4 },
        detectedAt: '2026-11-11T08:21:00',
        audit: [{ ts: '2026-11-11T08:21:00', actor: 'GY-44-05', text: 'Lean exceeded 4.5° collapse threshold' }],
      },
      {
        id: 'INC-1402',
        category: 'STRUCTURAL',
        type: 'STRAP_SNAP',
        severity: 'WARNING',
        status: 'OPEN',
        title: 'Steel strap #2 snapped',
        detail: "Strain gauge SG-43-D3-2 dropped from 4.1 kN to 0 kN at 07:05 on bale 411284471. The remaining straps now carry the bale's expansion load.",
        baleId: '411284471',
        zone: 'S-W',
        target: { slot: 'L-43/D/R3' },
        sensor: { id: 'SG-43-D3-2', kind: 'Strap strain gauge', metric: 'tension', value: 0, unit: 'kN', limit: 2.5 },
        detectedAt: '2026-11-11T07:05:00',
        audit: [{ ts: '2026-11-11T07:05:00', actor: 'SG-43-D3-2', text: 'Tension 4.1 kN → 0 kN (strap break)' }],
      },
      {
        id: 'INC-1403',
        category: 'STRUCTURAL',
        type: 'TILT',
        severity: 'INFO',
        status: 'OPEN',
        title: 'Stack L-2/R6 at 2.1° — monitoring',
        detail: 'Gyro GY-02-06 reports a slow 2.1° lean, below the 3° warning level. Re-check at the next shift walk.',
        zone: 'N-W',
        target: { column: { lane: 2, row: 6 } },
        sensor: { id: 'GY-02-06', kind: 'Micro-gyro tilt sensor', metric: 'tilt', value: 2.1, unit: '°', limit: 3, ratePerHour: 0.05 },
        detectedAt: '2026-11-11T06:40:00',
        audit: [{ ts: '2026-11-11T06:40:00', actor: 'GY-02-06', text: 'Lean above 2° monitoring level' }],
      },
      {
        id: 'INC-1098',
        category: 'PEST',
        type: 'TRAP',
        severity: 'WARNING',
        status: 'RESOLVED',
        title: 'Trap #03 triggered on north wall',
        detail: 'Trap #03 fired at 21:40. One rodent removed, trap reset and bait refreshed.',
        target: { trap: 3 },
        sensor: { id: 'TRAP-03', kind: 'IoT snap trap + IR', metric: 'events', value: 1, unit: 'IR events', limit: 0 },
        detectedAt: '2026-11-10T21:40:00',
        resolvedAt: '2026-11-10T22:35:00',
        doneSteps: 'all',
        audit: [
          { ts: '2026-11-10T21:40:00', actor: 'TRAP-03', text: 'Trap fired' },
          { ts: '2026-11-10T22:35:00', actor: 'Pest control', text: 'Resolved — trap reset, no fibre damage' },
        ],
      },
      {
        id: 'INC-1099',
        category: 'FIRE',
        type: 'BLOCKAGE',
        severity: 'CRITICAL',
        status: 'RESOLVED',
        title: 'Emergency exit EX-N2 obstructed',
        detail: 'Stacked empty pallets in front of emergency exit EX-N2. Cleared by the floor marshal.',
        hydrant: 'H-2',
        target: { exit: 'EX-N2' },
        sensor: { id: 'CAM-EXN2', kind: 'Exit CV camera', metric: 'clutter', value: 3.1, unit: 'm²', limit: 0 },
        detectedAt: '2026-11-10T16:05:00',
        resolvedAt: '2026-11-10T16:40:00',
        doneSteps: 'all',
        audit: [
          { ts: '2026-11-10T16:05:00', actor: 'CAM-EXN2', text: 'Exit obstruction detected' },
          { ts: '2026-11-10T16:40:00', actor: 'Floor marshal', text: 'Resolved — exit cleared and verified on camera' },
        ],
      },
    ],
  },
};

const DEFAULT_SELECTED_ID = '411275167';

/* ============================================================================
 * 2. LAYOUT GEOMETRY  (world units ≈ metres; +X east, +Y up, +Z south)
 * ----------------------------------------------------------------------------
 * The main drive aisle runs east–west along X. Entry gate (green) sits at the
 * west end, exit gate (red) at the east end. North block lanes extend −Z from
 * the aisle, south block lanes extend +Z. Row R1 is nearest the aisle.
 * ========================================================================== */
const LAYOUT = WAREHOUSE_DATA.layout;
const SHELVES = LAYOUT.shelves;
const ROWS = LAYOUT.rowsPerLane;
const DIM = {
  // 3.6 m pitch leaves a ~1.9 m access aisle between racks — room for a narrow-aisle forklift.
  lanePitch: 3.6,
  rowPitch: 1.25,
  levelPitch: 1.05,
  bale: { w: 1.4, h: 0.82, d: 1.04 },
  aisleHalf: 3.25,
  laneMouth: 3.75,
  bx: 17.5, // blocks span ±12.6 m; entry / exit zones take the outer 4.3 m on each side
  bz: 16,
  wallH: 6.8,
};
const BLOCKS = LAYOUT.blocks.map((b, i) => ({ ...b, dir: i === 0 ? -1 : 1 }));
const levelBaseY = (level) => 0.1 + level * DIM.levelPitch;
const RACK_H = levelBaseY(SHELVES.length) + 0.02;
const slotKeyOf = (lane, shelf, row) => `L-${lane}/${shelf}/R${row}`;
const gridToKey = (g) => (g ? `${g.bayX}/${g.shelfY}/R${g.rowZ}` : null);

const SLOTS = [];
const SLOT_BY_KEY = new Map();
const LANE_INFO = new Map();
BLOCKS.forEach((block) => {
  block.lanes.forEach((lane, laneIdx) => {
    const x = (laneIdx - (block.lanes.length - 1) / 2) * DIM.lanePitch;
    LANE_INFO.set(lane, { lane, block, x, laneIdx });
    for (let row = 1; row <= ROWS; row++) {
      SHELVES.forEach((shelf, level) => {
        const slot = {
          key: slotKeyOf(lane, shelf, row),
          idx: SLOTS.length,
          lane,
          bay: `L-${lane}`,
          block: block.id,
          blockName: block.name,
          dir: block.dir,
          laneIdx,
          row,
          level,
          shelf,
          lot: LAYOUT.specialLots.find((l) => l.lanes.includes(lane) && row >= l.rows[0] && row <= l.rows[1])?.id ?? null,
          x,
          y: levelBaseY(level) + DIM.bale.h / 2,
          z: block.dir * (DIM.laneMouth + (row - 0.5) * DIM.rowPitch),
        };
        SLOTS.push(slot);
        SLOT_BY_KEY.set(slot.key, slot);
      });
    }
  });
});
const CAPACITY = SLOTS.length;
const SLOT_STATUSES = new Set(['STORED', 'QC_HOLD']);
const LANE_COUNT = LANE_INFO.size;

/* ============================================================================
 * 3. DATA PIPELINE
 * ========================================================================== */
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const SNAPSHOT_MS = Date.parse(WAREHOUSE_DATA.meta.snapshotAt);
const TIME_SHIFT = WAREHOUSE_DATA.meta.rebaseToLiveClock ? Date.now() - SNAPSHOT_MS : 0;
const BASE_NOW = SNAPSHOT_MS + TIME_SHIFT;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round1 = (v) => Math.round(v * 10) / 10;
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rr = (rng, a, b) => a + (b - a) * rng();
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
function pickWeighted(rng, entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

const GRADE_META = {
  'A+': { label: 'A+ · Premium', type: 'Premium · Long Staple', hex3d: '#2a78d6', swatch: 'bg-[#2a78d6]', mic: [3.8, 4.3], staple: [29.2, 31], strength: [29.5, 32], trash: [1.3, 2.1] },
  A: { label: 'A · Standard', type: 'Standard · Medium-Long Staple', hex3d: '#86b6ef', swatch: 'bg-[#86b6ef]', mic: [3.7, 4.5], staple: [28, 29.4], strength: [28, 30], trash: [1.7, 2.5] },
  B: { label: 'B · Commercial', type: 'Commercial · Medium Staple', hex3d: '#f0a3a0', swatch: 'bg-[#f0a3a0]', mic: [3.5, 4.9], staple: [26.5, 28], strength: [26, 28.4], trash: [2.4, 3.4] },
  C: { label: 'C · Off-grade', type: 'Off-grade · Short Staple', hex3d: '#e34948', swatch: 'bg-[#e34948]', mic: [3.2, 5.3], staple: [24.6, 26.4], strength: [24, 26], trash: [3.4, 4.6] },
};
const GRADE_DIST = [['A+', 22], ['A', 40], ['B', 28], ['C', 10]];
const GINS = [
  { code: 'G-07', name: 'Ginning Unit G-07', city: 'Adilabad' },
  { code: 'G-12', name: 'Ginning Unit G-12', city: 'Warangal' },
  { code: 'G-03', name: 'Ginning Unit G-03', city: 'Khammam' },
  { code: 'G-21', name: 'Ginning Unit G-21', city: 'Nagpur' },
  { code: 'G-15', name: 'Ginning Unit G-15', city: 'Rajkot' },
];
const VARIETIES = ['Shankar-6', 'MCU-5', 'Bunny Bt', 'DCH-32', 'H-4', 'J-34', 'Suraj'];
const DESTINATIONS = ['Spinning Mill M-04 · Coimbatore', 'Spinning Mill M-11 · Tiruppur', 'Spinning Mill M-02 · Ludhiana', 'Export Hub EX-1 · Mundra Port'];
const RELOCATION_REASONS = ['Rack beam inspection', 'Consolidated for outbound order', 'FIFO re-slotting', 'Lot grouping'];

const lastEvent = (b) => b.history[b.history.length - 1];
const lastTs = (b) => lastEvent(b)?.ts ?? 0;
const forkliftRef = (rng) => `Forklift FL-0${1 + Math.floor(rng() * 6)}`;
const truckNo = (rng) => `TS-${String(1 + Math.floor(rng() * 12)).padStart(2, '0')}-U${'ABCDE'[Math.floor(rng() * 5)]}-${1000 + Math.floor(rng() * 8999)}`;
const shiftTs = (iso) => (iso ? Date.parse(iso) + TIME_SHIFT : null);

function normalizeTrackedBale(raw) {
  return {
    id: raw.baleId,
    lot: raw.lotNo,
    variety: raw.variety,
    fiber: raw.fiber ?? 'Cotton',
    grade: raw.grade,
    qualityType: raw.qualityType,
    weightKg: raw.weightKg,
    quality: { ...raw.quality },
    origin: raw.origin,
    status: raw.status,
    slot: gridToKey(raw.grid),
    lastSlot: gridToKey(raw.lastGrid),
    destination: raw.destination ?? null,
    eta: shiftTs(raw.eta),
    tracked: true,
    history: raw.history.map((h) => ({ type: h.event, title: h.title, site: h.site, ts: shiftTs(h.ts), note: h.note ?? null, ref: h.ref ?? null })),
  };
}

function synthIdentity(rng, id) {
  const grade = pickWeighted(rng, GRADE_DIST);
  const g = GRADE_META[grade];
  const gin = pick(rng, GINS);
  const bale = {
    id,
    lot: '',
    variety: pick(rng, VARIETIES),
    fiber: 'Cotton',
    grade,
    qualityType: g.type,
    weightKg: round1(rr(rng, 157.5, 173.5)),
    quality: {
      micronaire: round1(rr(rng, ...g.mic)),
      stapleMm: round1(rr(rng, ...g.staple)),
      strengthGtex: round1(rr(rng, ...g.strength)),
      moisturePct: round1(rr(rng, 6.6, 8.2)),
      trashPct: round1(rr(rng, ...g.trash)),
    },
    origin: `${gin.name} · ${gin.city}`,
    status: 'STORED',
    slot: null,
    lastSlot: null,
    destination: null,
    eta: null,
    tracked: false,
    history: [],
  };
  return { bale, gin };
}

/** Identity overrides for bales generated inside the high-value fibre lots. */
const LOT_IDENTITY = {
  'HV-1': (rng) => ({
    fiber: 'Egyptian Giza 45 ELS Cotton',
    variety: pick(rng, ['Giza 45', 'Giza 87']),
    grade: 'A+',
    qualityType: 'Extra-Long Staple · Imported',
    weightKg: round1(rr(rng, 178, 186)),
    origin: 'Import Lot · Alexandria, Egypt',
    quality: { micronaire: round1(rr(rng, 3.4, 3.9)), stapleMm: round1(rr(rng, 34, 36.5)), strengthGtex: round1(rr(rng, 42, 46)), moisturePct: round1(rr(rng, 6.4, 7.4)), trashPct: round1(rr(rng, 0.6, 1.2)) },
    gin: { code: 'EG-ALX', name: 'Alexandria Ginning Co.', city: 'Alexandria, Egypt' },
  }),
  'SL-1': (rng) => ({
    fiber: 'Mulberry Raw Silk',
    variety: 'Bivoltine 3A',
    grade: 'A+',
    qualityType: 'Raw Silk · 20/22 denier',
    weightKg: round1(rr(rng, 58, 64)),
    origin: 'Silk Reeling Unit · Ramanagara',
    quality: { micronaire: round1(rr(rng, 20.2, 21.6)), stapleMm: 0, strengthGtex: round1(rr(rng, 3.6, 4.1)), moisturePct: round1(rr(rng, 10.5, 11.5)), trashPct: round1(rr(rng, 0.2, 0.6)) },
    gin: { code: 'SR-RMN', name: 'Silk Reeling Unit', city: 'Ramanagara' },
  }),
  'WL-1': (rng) => ({
    fiber: 'Merino Greasy Wool',
    variety: `Merino ${round1(rr(rng, 19.5, 22.5))} µm`,
    grade: 'A',
    qualityType: 'Fine Wool · Greasy',
    weightKg: round1(rr(rng, 185, 198)),
    origin: 'Import Lot · Fremantle, Australia',
    quality: { micronaire: round1(rr(rng, 19.5, 22.5)), stapleMm: round1(rr(rng, 70, 86)), strengthGtex: round1(rr(rng, 34, 40)), moisturePct: round1(rr(rng, 11, 14)), trashPct: round1(rr(rng, 0.8, 1.8)) },
    gin: { code: 'WP-FRE', name: 'Wool Press · Fremantle', city: 'Australia' },
  }),
};

function synthUpstream(rng, bale, gin, twOutAt) {
  const twIn = twOutAt - rr(rng, 1, 6) * DAY;
  const qc = twIn - rr(rng, 10, 22) * HOUR;
  const produced = qc - rr(rng, 3, 6) * HOUR;
  const d = new Date(produced);
  bale.lot = `LOT-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${String(1000 + Math.floor(rng() * 8999))}`;
  return [
    { type: 'PRODUCED', title: 'Bale Production', site: `${gin.name} · Press Line ${1 + Math.floor(rng() * 3)}`, ts: produced, note: null, ref: null },
    { type: 'QC_GRADED', title: 'Quality Graded (HVI)', site: `${gin.code} QC Lab`, ts: qc, note: `Grade ${bale.grade} · Mic ${bale.quality.micronaire} · ${bale.quality.stapleMm} mm staple`, ref: null },
    { type: 'TW_IN', title: 'Entered Transit Warehouse 3', site: `TW-3 · Inbound Gate ${1 + Math.floor(rng() * 3)}`, ts: twIn, note: null, ref: `Truck ${truckNo(rng)}` },
    { type: 'TW_OUT', title: 'Exited Transit Warehouse 3', site: `TW-3 · Dispatch Dock ${1 + Math.floor(rng() * 6)}`, ts: twOutAt, note: null, ref: `Trip TR-${88000 + Math.floor(rng() * 900)}` },
  ];
}

const storedEvent = (rng, key, ts) => ({
  type: 'STORED',
  title: `Entered Warehouse 15-1 at ${key}`,
  site: `WH 15-1 · Entry Gate E-1 → ${SLOT_BY_KEY.get(key).blockName}`,
  ts,
  note: null,
  ref: forkliftRef(rng),
});
const arrivalEvent = (ts) => ({ type: 'WH_IN', title: 'Arrived at Warehouse 15-1', site: 'WH 15-1 · Entry Gate E-1 · Receiving Bay', ts, note: 'Weighbridge OK · awaiting put-away slot', ref: null });

/** Tracked bales from the JSON + a deterministic (seeded) background fill so the
 *  warehouse reaches its target occupancy. Same output on every load. */
function buildInitialBales() {
  const tracked = WAREHOUSE_DATA.bales.map(normalizeTrackedBale);
  const rng = mulberry32(0x15012026);
  const used = new Set(tracked.map((b) => b.id));
  const newId = () => {
    let id;
    do id = String(411200000 + Math.floor(rng() * 96000));
    while (used.has(id));
    used.add(id);
    return id;
  };
  const taken = new Set(tracked.filter((b) => b.slot && SLOT_STATUSES.has(b.status)).map((b) => b.slot));
  const laneBias = new Map([...LANE_INFO.keys()].map((lane) => [lane, 0.55 + rng() * 0.9]));
  const LEVEL_W = [1, 0.85, 0.68, 0.5];
  // Weighted sampling without replacement (Efraimidis–Spirakis): lower shelves and
  // some lanes fill up more, which reads like a real floor.
  const ranked = SLOTS.filter((s) => !taken.has(s.key))
    .map((s) => ({ s, k: Math.pow(rng(), 1 / ((LEVEL_W[s.level] ?? 0.4) * laneBias.get(s.lane) * (1.12 - s.row * 0.025) * (s.lot ? 1.6 : 1))) }))
    .sort((a, b) => b.k - a.k);
  const need = clamp(LAYOUT.targetFilledSlots - taken.size, 0, ranked.length);
  const freeAfterFill = ranked.slice(need).map((r) => r.s);
  const out = [];

  ranked.slice(0, need).forEach(({ s }) => {
    const ident = synthIdentity(rng, newId());
    const bale = ident.bale;
    let gin = ident.gin;
    if (s.lot && LOT_IDENTITY[s.lot]) {
      const { gin: lotGin, ...over } = LOT_IDENTITY[s.lot](rng);
      Object.assign(bale, over);
      gin = lotGin;
    }
    const storedAt = BASE_NOW - rr(rng, 0.15, 70) * DAY;
    bale.history = synthUpstream(rng, bale, gin, storedAt - rr(rng, 3, 10) * HOUR);
    const from = rng() < 0.06 && freeAfterFill.length ? pick(rng, freeAfterFill) : null;
    if (from) {
      bale.history.push(storedEvent(rng, from.key, storedAt));
      bale.history.push({
        type: 'RELOCATED',
        title: `Relocated ${from.key} → ${s.key}`,
        site: `WH 15-1 · ${s.blockName}`,
        ts: storedAt + (BASE_NOW - storedAt) * rr(rng, 0.25, 0.85),
        note: pick(rng, RELOCATION_REASONS),
        ref: forkliftRef(rng),
      });
    } else {
      bale.history.push(storedEvent(rng, s.key, storedAt));
    }
    bale.slot = s.key;
    out.push(bale);
  });

  for (let i = 0; i < 10; i++) {
    const { bale, gin } = synthIdentity(rng, newId());
    const twOut = BASE_NOW - rr(rng, 0.3, 7.5) * HOUR;
    bale.status = 'IN_TRANSIT';
    bale.history = synthUpstream(rng, bale, gin, twOut);
    bale.eta = twOut + rr(rng, 6, 9) * HOUR;
    out.push(bale);
  }

  for (let i = 0; i < 2; i++) {
    const { bale, gin } = synthIdentity(rng, newId());
    const whIn = BASE_NOW - rr(rng, 0.2, 1.4) * HOUR;
    bale.status = 'RECEIVING';
    bale.history = [...synthUpstream(rng, bale, gin, whIn - rr(rng, 3, 8) * HOUR), arrivalEvent(whIn)];
    out.push(bale);
  }

  for (let i = 0; i < 12; i++) {
    const { bale, gin } = synthIdentity(rng, newId());
    const slot = pick(rng, freeAfterFill.length ? freeAfterFill : SLOTS);
    const storedAt = BASE_NOW - rr(rng, 8, 60) * DAY;
    const pickedAt = Math.min(BASE_NOW - rr(rng, 0.08, 3) * DAY, BASE_NOW - 80 * MIN);
    const destination = pick(rng, DESTINATIONS);
    bale.status = 'DISPATCHED';
    bale.lastSlot = slot.key;
    bale.destination = destination;
    bale.history = [
      ...synthUpstream(rng, bale, gin, storedAt - rr(rng, 3, 10) * HOUR),
      storedEvent(rng, slot.key, storedAt),
      { type: 'PICKED', title: `Picked from ${slot.key}`, site: `WH 15-1 · ${slot.blockName}`, ts: pickedAt, note: null, ref: `Order SO-15-${7600 + Math.floor(rng() * 380)}` },
      { type: 'DISPATCHED', title: 'Exited Warehouse 15-1', site: 'WH 15-1 · Exit Gate X-1', ts: pickedAt + rr(rng, 25, 70) * MIN, note: `To ${destination}`, ref: `Invoice INV-15-${20600 + Math.floor(rng() * 380)}` },
    ];
    out.push(bale);
  }
  return [...tracked, ...out];
}

const countFilled = (bales) => bales.reduce((n, b) => n + (b.slot && SLOT_STATUSES.has(b.status) ? 1 : 0), 0);

/* ---- Live simulation (touches only generated bales, never the tracked JSON set) */
function newSimId(bales) {
  const ids = new Set(bales.map((b) => b.id));
  let id;
  do id = String(411300000 + Math.floor(Math.random() * 90000));
  while (ids.has(id));
  return id;
}

function planSimEvent(bales, now) {
  const rnd = Math.random;
  const occupied = new Set();
  const gen = { transit: [], receiving: [], stored: [] };
  for (const b of bales) {
    if (b.slot && SLOT_STATUSES.has(b.status)) occupied.add(b.slot);
    if (b.tracked) continue;
    if (b.status === 'IN_TRANSIT') gen.transit.push(b);
    else if (b.status === 'RECEIVING') gen.receiving.push(b);
    // Leave freshly stored bales alone so a forklift isn't asked to pick a bale it is still placing.
    else if (b.status === 'STORED' && now - lastTs(b) > 60_000) gen.stored.push(b);
  }
  const occ = occupied.size / CAPACITY;
  const target = LAYOUT.targetFilledSlots / CAPACITY;
  const pDispatch = clamp(0.3 + (occ - target) * 9, 0.08, 0.75);

  if (rnd() < pDispatch && gen.stored.length) {
    const b = pick(rnd, gen.stored);
    return {
      kind: 'DISPATCH',
      baleId: b.id,
      slot: b.slot,
      ts: now,
      loadMs: rr(rnd, 2, 6) * MIN,
      destination: pick(rnd, DESTINATIONS),
      order: `Order SO-15-${7800 + Math.floor(rnd() * 190)}`,
      invoice: `Invoice INV-15-${21000 + Math.floor(rnd() * 900)}`,
    };
  }
  const free = SLOTS.filter((s) => !occupied.has(s.key) && !s.lot);
  if (gen.receiving.length && free.length && (rnd() < 0.55 || gen.receiving.length >= 4 || !gen.transit.length)) {
    const b = gen.receiving.reduce((a, c) => (lastTs(c) < lastTs(a) ? c : a));
    const low = free.filter((s) => s.level <= 1);
    const slot = pick(rnd, low.length && rnd() < 0.7 ? low : free);
    return { kind: 'PUTAWAY', baleId: b.id, slot: slot.key, ts: now, ref: forkliftRef(rnd) };
  }
  if (gen.transit.length) {
    const b = gen.transit.reduce((a, c) => ((c.eta ?? 0) < (a.eta ?? 0) ? c : a));
    const { bale: spawn, gin } = synthIdentity(rnd, newSimId(bales));
    const twOut = now - rr(rnd, 0.05, 0.6) * HOUR;
    spawn.status = 'IN_TRANSIT';
    spawn.history = synthUpstream(rnd, spawn, gin, twOut);
    spawn.eta = twOut + rr(rnd, 5, 8) * HOUR;
    return { kind: 'ARRIVE', baleId: b.id, ts: now, spawn };
  }
  return null;
}

function applySimEvent(b, ev) {
  switch (ev.kind) {
    case 'ARRIVE':
      return { ...b, status: 'RECEIVING', eta: null, history: [...b.history, arrivalEvent(ev.ts)] };
    case 'PUTAWAY': {
      const s = SLOT_BY_KEY.get(ev.slot);
      return {
        ...b,
        status: 'STORED',
        slot: ev.slot,
        history: [...b.history, { type: 'STORED', title: `Stored at ${ev.slot}`, site: `WH 15-1 · Receiving Bay → ${s.blockName}`, ts: ev.ts, note: null, ref: ev.ref }],
      };
    }
    case 'DISPATCH': {
      const pickedAt = Math.max(lastTs(b) + MIN, ev.ts - ev.loadMs);
      return {
        ...b,
        status: 'DISPATCHED',
        slot: null,
        lastSlot: b.slot,
        destination: ev.destination,
        history: [
          ...b.history,
          { type: 'PICKED', title: `Picked from ${b.slot}`, site: `WH 15-1 · ${SLOT_BY_KEY.get(b.slot)?.blockName ?? ''}`, ts: pickedAt, note: null, ref: ev.order },
          { type: 'DISPATCHED', title: 'Exited Warehouse 15-1', site: 'WH 15-1 · Exit Gate X-1', ts: ev.ts, note: `To ${ev.destination}`, ref: ev.invoice },
        ],
      };
    }
    default:
      return b;
  }
}

const FEED_KIND_BY_EVENT = { WH_IN: 'ARRIVE', STORED: 'PUTAWAY', DISPATCHED: 'DISPATCH', TW_OUT: 'DEPART', QC_HOLD: 'HOLD', RELOCATED: 'MOVE' };
const FEED_META = {
  ARRIVE: { status: 'RECEIVING', text: () => 'arrived at Entry Gate E-1' },
  PUTAWAY: { status: 'STORED', text: (slot) => `stored at ${slot}` },
  DISPATCH: { status: 'DISPATCHED', text: (slot) => `dispatched${slot ? ` from ${slot}` : ''} via X-1` },
  DEPART: { status: 'IN_TRANSIT', text: () => 'left Transit WH 3 → WH 15-1' },
  HOLD: { status: 'QC_HOLD', text: () => 'placed on QC hold' },
  MOVE: { status: 'STORED', text: (slot) => `relocated to ${slot}` },
};
const makeFeedItem = (kind, baleId, ts, slot) => ({ id: `${kind}:${baleId}:${ts}`, kind, baleId, ts, slot: slot ?? null });

function seedFeed(bales, incidents = []) {
  const items = incidents.filter((i) => i.status !== 'RESOLVED' && i.detectedAt > BASE_NOW - 6 * HOUR).map((i) => hazardFeedItem(i, 'detected', i.detectedAt));
  for (const b of bales) {
    for (const h of b.history) {
      const kind = FEED_KIND_BY_EVENT[h.type];
      if (!kind || h.ts < BASE_NOW - 10 * HOUR) continue;
      const slot = kind === 'DISPATCH' ? b.lastSlot : kind === 'PUTAWAY' || kind === 'MOVE' ? b.slot : null;
      items.push(makeFeedItem(kind, b.id, h.ts, slot));
    }
  }
  return items.sort((a, b) => b.ts - a.ts).slice(0, 8);
}

/** Deterministic random walk that ends at `end` — seeds the trend sparklines. */
function seedWalk(end, step, seed, decimals = 0) {
  const rng = mulberry32(seed);
  const f = 10 ** decimals;
  const out = [end];
  let v = end;
  for (let i = 0; i < 15; i++) {
    v = Math.round((v - rr(rng, -step, step)) * f) / f;
    out.unshift(v);
  }
  return out;
}

function initState() {
  const bales = buildInitialBales();
  const filled = countFilled(bales);
  const incidents = SAFETY.incidents.map((r) => normalizeIncident(r));
  const health = computeHealth(incidents).overall;
  return {
    bales,
    incidents,
    feed: seedFeed(bales, incidents),
    occHistory: seedWalk(filled, 2.4, 42),
    healthHistory: seedWalk(health, 1.1, 77, 1),
    baseline: { filled, inTransit: bales.filter((b) => b.status === 'IN_TRANSIT').length, at: Date.now() },
    lastEvent: null,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'SIM_EVENT': {
      const ev = action.event;
      const bales = state.bales.map((b) => (b.id === ev.baleId ? applySimEvent(b, ev) : b));
      if (ev.spawn) bales.push(ev.spawn);
      const item = makeFeedItem(ev.kind, ev.baleId, ev.ts, ev.slot);
      return {
        ...state,
        bales,
        feed: [item, ...state.feed].slice(0, 30),
        occHistory: [...state.occHistory, countFilled(bales)].slice(-16),
        lastEvent: item,
      };
    }
    case 'TELEMETRY': {
      const { updates, newIncident, ts, pushHealth } = action;
      let incidents = state.incidents.map((i) => {
        const v = updates[i.id];
        if (v == null) return i;
        const next = { ...i, sensor: { ...i.sensor, value: v } };
        if (i.type === 'THERMAL' && i.status !== 'RESOLVED' && v >= 60 && !i.over60) {
          next.over60 = true;
          next.severity = 'CRITICAL';
          next.audit = [...i.audit, { ts, actor: i.sensor.id, text: 'Core temperature crossed 60 °C — auto-escalated' }];
        }
        return next;
      });
      let feed = state.feed;
      if (newIncident) {
        incidents = [newIncident, ...incidents];
        feed = [hazardFeedItem(newIncident, 'detected', ts), ...feed].slice(0, 30);
      }
      const changed = pushHealth || newIncident;
      return {
        ...state,
        incidents,
        feed,
        healthHistory: changed ? [...state.healthHistory, computeHealth(incidents).overall].slice(-16) : state.healthHistory,
      };
    }
    case 'INCIDENT': {
      const { id, op, step, ts } = action;
      let changedInc = null;
      const incidents = state.incidents.map((i) => {
        if (i.id !== id) return i;
        changedInc = applyIncidentOp(i, op, ts, step);
        return changedInc;
      });
      if (!changedInc) return state;
      const verb = { ack: 'Acknowledged', resolve: 'Resolved', escalate: 'Escalated', reopen: 'Re-opened' }[op];
      return {
        ...state,
        incidents,
        feed: verb ? [hazardFeedItem(changedInc, verb, ts), ...state.feed].slice(0, 30) : state.feed,
        healthHistory: [...state.healthHistory, computeHealth(incidents).overall].slice(-16),
      };
    }
    default:
      return state;
  }
}

function deriveStats(bales) {
  const byId = new Map();
  const occupancy = new Map();
  const counts = { ALL: bales.length, WATCH: 0, IN_TRANSIT: 0, RECEIVING: 0, STORED: 0, QC_HOLD: 0, DISPATCHED: 0 };
  const receiving = [];
  const dayAgo = Date.now() - DAY;
  let dispatched24h = 0;
  for (const b of bales) {
    byId.set(b.id, b);
    counts[b.status] += 1;
    if (b.tracked) counts.WATCH += 1;
    if (b.slot && SLOT_STATUSES.has(b.status)) occupancy.set(b.slot, b.id);
    if (b.status === 'RECEIVING') receiving.push(b);
    if (b.status === 'DISPATCHED' && lastTs(b) > dayAgo) dispatched24h += 1;
  }
  receiving.sort((a, b) => lastTs(a) - lastTs(b));
  const filled = occupancy.size;
  return { byId, occupancy, counts, filled, available: CAPACITY - filled, rate: filled / CAPACITY, receivingIds: receiving.map((b) => b.id), dispatched24h };
}

function locationLabel(b) {
  if (b.slot) return b.slot;
  if (b.status === 'IN_TRANSIT') return 'En route';
  if (b.status === 'RECEIVING') return 'Gate E-1';
  if (b.status === 'DISPATCHED') return b.lastSlot ? `ex ${b.lastSlot}` : 'Exit X-1';
  return '—';
}
function zoneLabel(b) {
  if (b.slot) return SLOT_BY_KEY.get(b.slot)?.blockName ?? '';
  if (b.status === 'IN_TRANSIT') return 'TW-3 → WH 15-1';
  if (b.status === 'RECEIVING') return 'Receiving bay';
  if (b.status === 'DISPATCHED') return (b.destination ?? 'Outbound').split(' · ')[0];
  return '';
}

/* ============================================================================
 * 3b. RISK & SENSOR MODEL — hazard geometry, playbooks, health index, telemetry
 * ========================================================================== */
const SAFETY = WAREHOUSE_DATA.safety;
const TH = SAFETY.thresholds;
const SPECIAL_LOTS = LAYOUT.specialLots;
const LOT_BY_ID = new Map(SPECIAL_LOTS.map((l) => [l.id, l]));
const pad2 = (n) => String(n).padStart(2, '0');
const laneZ = (lane, row) => LANE_INFO.get(lane).block.dir * (DIM.laneMouth + (row - 0.5) * DIM.rowPitch);
function laneRect(lanes, rows = [1, ROWS]) {
  const xs = lanes.map((l) => LANE_INFO.get(l).x);
  const dir = LANE_INFO.get(lanes[0]).block.dir;
  const za = dir * (DIM.laneMouth + (rows[0] - 1) * DIM.rowPitch);
  const zb = dir * (DIM.laneMouth + rows[1] * DIM.rowPitch);
  return [Math.min(...xs) - DIM.lanePitch / 2, Math.min(za, zb), Math.max(...xs) + DIM.lanePitch / 2, Math.max(za, zb)];
}
const ZONES = SAFETY.zones.map((z) => {
  const rect = z.lanes
    ? laneRect(z.lanes)
    : z.id === 'AISLE'
      ? [-(DIM.bx - 4.3), -DIM.aisleHalf, DIM.bx - 4.3, DIM.aisleHalf]
      : z.id === 'RCV'
        ? [-DIM.bx, -7, -(DIM.bx - 4.3), 7]
        : [DIM.bx - 4.3, -7, DIM.bx, 7];
  return { ...z, rect, cx: (rect[0] + rect[2]) / 2, cz: (rect[1] + rect[3]) / 2 };
});
const ZONE_BY_ID = new Map(ZONES.map((z) => [z.id, z]));
const zoneIdOfSlot = (s) => ZONES.find((z) => z.lanes?.includes(s.lane))?.id ?? null;
const TRAPS = SAFETY.traps.map((t) => (t.lane ? { ...t, x: LANE_INFO.get(t.lane).x + 1.05, z: laneZ(t.lane, t.row) } : { ...t }));
const TRAP_BY_ID = new Map(TRAPS.map((t) => [t.id, t]));
const HYDRANTS = SAFETY.hydrants;
const EXITS = SAFETY.exits;
const EXIT_BY_ID = new Map(EXITS.map((e) => [e.id, e]));
const DOCK_POS = { 'E-1': { x: -DIM.bx + 1.6, z: 0 }, 'X-1': { x: DIM.bx - 1.6, z: 0 } };
const HV_LOT = SPECIAL_LOTS.find((l) => l.caged);
const HV_RECT = (() => {
  const r = laneRect(HV_LOT.lanes, HV_LOT.rows);
  return [r[0] + 0.05, r[1] - 0.15, r[2] - 0.05, r[3] + 0.15];
})();
const BEAM_GEOM = (() => {
  const [x0, z0, x1, z1] = HV_RECT;
  const north = LANE_INFO.get(HV_LOT.lanes[0]).block.dir < 0;
  const front = north ? z1 : z0;
  const rear = north ? z0 : z1;
  const g = {
    'B-1': { label: 'front · aisle side', a: [x0, front], b: [x1, front] },
    'B-2': { label: 'west', a: [x0, z0], b: [x0, z1] },
    'B-3': { label: 'east', a: [x1, z0], b: [x1, z1] },
    'B-4': { label: 'rear', a: [x0, rear], b: [x1, rear] },
  };
  Object.values(g).forEach((b) => {
    b.cx = (b.a[0] + b.b[0]) / 2;
    b.cz = (b.a[1] + b.b[1]) / 2;
  });
  return g;
})();

/* Evacuation routes: every access aisle runs to the rear fire lane and the nearest
 * emergency exit; the main aisle runs to the two gates. */
const ASSEMBLY_POINTS = [
  { id: 'AP-A', name: 'Assembly point A', x: 0, z: -(DIM.bz + 5.4) },
  { id: 'AP-B', name: 'Assembly point B', x: 0, z: DIM.bz + 5.4 },
];
const EVAC_ROUTES = (() => {
  const routes = [
    { id: 'MAIN-W', exit: 'E-1', points: [[-3.5, 0], [-DIM.bx - 3.2, 0]] },
    { id: 'MAIN-E', exit: 'X-1', points: [[3.5, 0], [DIM.bx + 3.2, 0]] },
  ];
  for (const [lane, L] of LANE_INFO) {
    const ax = L.x + DIM.lanePitch / 2;
    const d = L.block.dir;
    const ex = ax < 0 ? -3.6 : 3.6;
    const rearZ = d * (DIM.laneMouth + ROWS * DIM.rowPitch + 1.4);
    routes.push({
      id: `L-${lane}`,
      lane,
      exit: `EX-${d < 0 ? 'N' : 'S'}${ax < 0 ? 1 : 2}`,
      points: [[ax, d * (DIM.laneMouth + 1.2)], [ax, rearZ], [ex, rearZ], [ex, d * (DIM.bz + 1.2)], [ex * 0.3, d * (DIM.bz + 4.6)]],
    });
  }
  return routes;
})();

/* User-specified overlay colours: red fire · purple theft · yellow pest · orange stack. */
const HAZARD_CATS = {
  FIRE: { label: 'Fire & Temp', short: 'Fire', icon: 'flame', hex: '#ef4444', aura: '#ff3b30', fg: 'text-[#dc2626] dark:text-[#f87171]', tile: 'bg-[#ef4444]/10 text-[#dc2626] dark:text-[#f87171]' },
  SECURITY: { label: 'Security & Theft', short: 'Security', icon: 'shield', hex: '#8b5cf6', aura: '#a855f7', fg: 'text-[#7c3aed] dark:text-[#a78bfa]', tile: 'bg-[#8b5cf6]/10 text-[#7c3aed] dark:text-[#a78bfa]' },
  PEST: { label: 'Rodent Traps', short: 'Pests', icon: 'rodent', hex: '#eab308', aura: '#facc15', fg: 'text-[#a16207] dark:text-[#facc15]', tile: 'bg-[#eab308]/15 text-[#a16207] dark:text-[#facc15]' },
  STRUCTURAL: { label: 'Stack Safety', short: 'Stacks', icon: 'stack', hex: '#f97316', aura: '#fb923c', fg: 'text-[#c2410c] dark:text-[#fb923c]', tile: 'bg-[#f97316]/10 text-[#c2410c] dark:text-[#fb923c]' },
};
const CAT_ORDER = ['FIRE', 'SECURITY', 'PEST', 'STRUCTURAL'];
const SEVERITY = {
  CRITICAL: { label: 'Critical', rank: 3, icon: 'octagon', fg: 'text-[#d03b3b] dark:text-[#f07272]', stripe: 'bg-[#d03b3b]', penalty: 10, weight: 1 },
  WARNING: { label: 'Warning', rank: 2, icon: 'alert', fg: 'text-[#b37900] dark:text-[#fab219]', stripe: 'bg-[#fab219]', penalty: 3, weight: 0.55 },
  INFO: { label: 'Info', rank: 1, icon: 'info', fg: 'text-slate-500 dark:text-slate-400', stripe: 'bg-slate-400', penalty: 0.5, weight: 0.2 },
};
const SEVERITY_ORDER = ['CRITICAL', 'WARNING', 'INFO'];
const INCIDENT_STATUS = {
  OPEN: { label: 'Open', icon: 'bell', fg: 'text-[#d03b3b] dark:text-[#f07272]' },
  ACKNOWLEDGED: { label: 'Acknowledged', icon: 'eye', fg: 'text-[#b37900] dark:text-[#fab219]' },
  IN_PROGRESS: { label: 'In progress', icon: 'activity', fg: 'text-cyan-600 dark:text-cyan-300' },
  RESOLVED: { label: 'Resolved', icon: 'check', fg: 'text-[#0a8f0a] dark:text-[#3fcf3f]' },
};
const INCIDENT_TYPES = {
  THERMAL: 'Thermal spike',
  SMOKE: 'Smoke detection',
  RH_HIGH: 'High humidity',
  RH_LOW: 'Dry air · static',
  BLOCKAGE: 'Route blockage',
  TRAP: 'Trap triggered',
  TRAP_SERVICE: 'Trap service',
  NESTING: 'Nesting risk',
  BEAM_BREACH: 'IR beam intrusion',
  RFID_LOST: 'RFID tag lost',
  DOCK_MISMATCH: 'Dock ID mismatch',
  TILT: 'Stack tilt',
  STRAP_SNAP: 'Strap failure',
};
const bySeverity = (a, b) => SEVERITY[b.severity].rank - SEVERITY[a.severity].rank || b.detectedAt - a.detectedAt;

function incidentAnchor(inc) {
  const t = inc.target ?? {};
  if (t.slot && SLOT_BY_KEY.has(t.slot)) {
    const s = SLOT_BY_KEY.get(t.slot);
    return { kind: 'slot', x: s.x, y: s.y, z: s.z, top: RACK_H, lane: s.lane, slot: s };
  }
  if (t.column) {
    const L = LANE_INFO.get(t.column.lane);
    return { kind: 'column', x: L.x, y: RACK_H / 2, z: laneZ(t.column.lane, t.column.row), top: RACK_H, lane: t.column.lane, row: t.column.row };
  }
  if (t.aisle) {
    const L = LANE_INFO.get(t.aisle.lane);
    const [r0, r1] = t.aisle.rows;
    return { kind: 'aisle', x: L.x + DIM.lanePitch / 2, y: 0.4, z: (laneZ(t.aisle.lane, r0) + laneZ(t.aisle.lane, r1)) / 2, top: 1.1, lane: t.aisle.lane, len: (r1 - r0 + 1) * DIM.rowPitch };
  }
  if (t.trap != null && TRAP_BY_ID.has(t.trap)) {
    const tr = TRAP_BY_ID.get(t.trap);
    return { kind: 'trap', x: tr.x, y: 0.15, z: tr.z, top: 0.5, lane: tr.lane ?? null };
  }
  if (t.beam && BEAM_GEOM[t.beam]) {
    const b = BEAM_GEOM[t.beam];
    return { kind: 'beam', x: b.cx, y: 1.4, z: b.cz, top: 3.0, beam: t.beam };
  }
  if (t.dock && DOCK_POS[t.dock]) {
    const d = DOCK_POS[t.dock];
    return { kind: 'dock', x: d.x, y: 1, z: d.z, top: 3.2 };
  }
  if (t.exit && EXIT_BY_ID.has(t.exit)) {
    const e = EXIT_BY_ID.get(t.exit);
    return { kind: 'exit', x: e.x, y: 1, z: e.z - Math.sign(e.z) * 0.8, top: 2.6 };
  }
  if (t.zone && ZONE_BY_ID.has(t.zone)) {
    const z = ZONE_BY_ID.get(t.zone);
    return { kind: 'zone', x: z.cx, y: 0.1, z: z.cz, top: z.lanes ? RACK_H : 2.5, rect: z.rect };
  }
  return null;
}

function incidentLocation(inc) {
  const t = inc.target ?? {};
  if (t.slot) return `${t.slot} · ${SLOT_BY_KEY.get(t.slot)?.blockName ?? ''}`;
  if (t.column) return `Stack L-${t.column.lane}/R${t.column.row} · ${LANE_INFO.get(t.column.lane).block.name}`;
  if (t.aisle) return `Access aisle L-${t.aisle.lane} · R${t.aisle.rows[0]}–R${t.aisle.rows[1]}`;
  if (t.trap != null) return `Trap #${pad2(t.trap)} · ${TRAP_BY_ID.get(t.trap)?.where ?? ''}`;
  if (t.beam) return `HV-1 cage · beam ${t.beam} (${BEAM_GEOM[t.beam].label})`;
  if (t.dock) return `Dock ${t.dock} · ${t.dock.startsWith('X') ? 'Outbound' : 'Inbound'}`;
  if (t.exit) return `Emergency exit ${t.exit}`;
  if (t.zone) return `Zone ${t.zone} · ${ZONE_BY_ID.get(t.zone)?.name ?? ''}`;
  return '—';
}
const laneLabelOf = (inc) => {
  const a = incidentAnchor(inc);
  return a?.lane ? `L-${a.lane}` : (inc.zone ?? 'the area');
};

function readingText(inc) {
  const s = inc.sensor;
  if (!s) return '';
  switch (s.metric) {
    case 'rssi':
      return s.value == null ? 'No signal' : `${s.value} dBm`;
    case 'coreTemp':
      return `${s.value.toFixed(1)} °C`;
    case 'rh':
      return `${s.value.toFixed(0)} % RH`;
    case 'tilt':
      return `${s.value.toFixed(1)}° lean`;
    case 'tension':
      return `${s.value.toFixed(1)} kN`;
    case 'obscuration':
      return `${s.value.toFixed(1)} %/m`;
    default:
      return `${s.value} ${s.unit}`;
  }
}
function limitText(inc) {
  const s = inc.sensor;
  if (!s) return '';
  switch (s.metric) {
    case 'coreTemp':
      return `limit ${s.limit} °C`;
    case 'rh':
      return inc.type === 'RH_LOW' ? `min ${s.limit} %` : `max ${s.limit} %`;
    case 'tilt':
      return `limit ${s.limit.toFixed(1)}°`;
    case 'tension':
      return `min ${s.limit} kN`;
    case 'rssi':
      return 'lost below −90 dBm';
    case 'clutter':
      return 'route must be clear';
    case 'events':
      return `baseline ${s.limit}`;
    case 'battery':
      return `service at ${s.limit} %`;
    case 'beam':
      return 'curtain must stay unbroken';
    case 'scan':
      return 'manifest must match';
    case 'obscuration':
      return `alarm at ${s.limit} %/m`;
    default:
      return '';
  }
}
function markerText(inc) {
  switch (inc.type) {
    case 'THERMAL':
      return `${inc.sensor.value.toFixed(1)} °C`;
    case 'RH_HIGH':
    case 'RH_LOW':
      return `${Math.round(inc.sensor.value)} % RH`;
    case 'SMOKE':
      return `${inc.sensor.value.toFixed(1)} %/m`;
    case 'BLOCKAGE':
      return 'Route blocked';
    case 'TRAP':
    case 'TRAP_SERVICE':
      return `Trap #${pad2(inc.target.trap)}`;
    case 'NESTING':
      return 'Nesting risk';
    case 'BEAM_BREACH':
      return `Beam ${inc.target.beam}`;
    case 'RFID_LOST':
      return 'Tag lost';
    case 'DOCK_MISMATCH':
      return 'ID mismatch';
    case 'TILT':
      return `${inc.sensor.value.toFixed(1)}° lean`;
    case 'STRAP_SNAP':
      return 'Strap snap';
    default:
      return INCIDENT_TYPES[inc.type] ?? inc.type;
  }
}

/* Response playbooks — the live checklist for each hazard type. */
const PLAYBOOKS = {
  THERMAL: (i) => [
    { text: 'Dispatch thermal drone for IR confirmation', role: 'Control room' },
    { text: `Isolate aisle ${laneLabelOf(i)} — halt forklift traffic`, role: 'Floor supervisor' },
    { text: 'Alert Fire Safety Officer', role: 'Control room' },
    { text: `Prime water-mist suppression in zone ${i.zone ?? '—'}`, role: 'Fire Safety Officer' },
    { text: 'Probe bale core with lance thermometer', role: 'Fire Safety Officer' },
    { text: 'Move bale to quarantine bay Q-1 and log reading', role: 'Floor supervisor' },
  ],
  SMOKE: (i) => [
    { text: `Verify detector ${i.sensor?.id ?? ''} on CCTV and a second detector`, role: 'Control room' },
    { text: 'Realign laser beam reflector', role: 'Maintenance' },
    { text: `Function-test suppression panel for zone ${i.zone}`, role: 'Fire Safety Officer' },
    { text: 'Record maintenance in fire register', role: 'Fire Safety Officer' },
  ],
  RH_HIGH: (i) => [
    { text: `Start dehumidifiers in zone ${i.zone}`, role: 'Maintenance' },
    { text: 'Close rear louvres and check roof for leaks', role: 'Maintenance' },
    { text: 'Moisture-probe bales in zone (target < 8.5 %)', role: 'QC' },
    { text: 'Schedule mould inspection of fibre lots', role: 'QC' },
  ],
  RH_LOW: (i) => [
    { text: `Start humidifier misting in zone ${i.zone}`, role: 'Maintenance' },
    { text: 'Verify anti-static grounding on forklifts & conveyors', role: 'Floor supervisor' },
    { text: 'Suspend hot-work permits in zone', role: 'Fire Safety Officer' },
    { text: 'Re-check RH after 30 minutes', role: 'Control room' },
  ],
  BLOCKAGE: (i) => [
    { text: 'Review CV snapshot and identify the owner', role: 'Control room' },
    { text: `Dispatch floor marshal to clear ${laneLabelOf(i)} route`, role: 'Floor supervisor' },
    { text: `Confirm hydrant ${i.hydrant ?? ''} and escape route clear on camera`, role: 'Control room' },
    { text: 'Issue non-compliance note to the shift', role: 'Floor supervisor' },
  ],
  TRAP: (i) => [
    { text: `Inspect and reset trap #${pad2(i.target?.trap ?? 0)}`, role: 'Pest control' },
    { text: 'Check adjacent bales for gnaw or urine damage', role: 'QC' },
    { text: 'Refresh bait stations within 5 m', role: 'Pest control' },
    { text: 'Notify pest-control vendor', role: 'Control room' },
  ],
  TRAP_SERVICE: (i) => [
    { text: `Replace battery in trap #${pad2(i.target?.trap ?? 0)}`, role: 'Pest control' },
    { text: 'Run trap self-test', role: 'Pest control' },
    { text: 'Update service log', role: 'Pest control' },
  ],
  NESTING: (i) => [
    { text: `Inspect lot ${i.lot ?? ''} for nests and droppings`, role: 'Pest control' },
    { text: 'Tarp and isolate affected bales', role: 'Floor supervisor' },
    { text: 'Raise fumigation request', role: 'Pest control' },
    { text: 'QC re-grade affected fibre', role: 'QC' },
    { text: 'Seal entry points along the wall', role: 'Maintenance' },
  ],
  BEAM_BREACH: () => [
    { text: 'Dispatch security guard to HV-1 cage', role: 'Security' },
    { text: 'Pull CCTV footage for the breach window', role: 'Control room' },
    { text: 'Verify cage lock and bale count against WMS', role: 'Security' },
    { text: 'Re-arm the beam curtain after sweep', role: 'Security' },
    { text: 'File security incident report', role: 'Security' },
  ],
  RFID_LOST: (i) => [
    { text: 'Lock down gates E-1 / X-1 and docks', role: 'Security' },
    { text: `Review CCTV at ${i.target?.slot ?? 'slot'}`, role: 'Control room' },
    { text: 'Cross-check forklift work orders', role: 'Floor supervisor' },
    { text: 'Physically verify the bale at its slot', role: 'Security' },
    { text: 'Notify Security Head and insurer', role: 'Security' },
  ],
  DOCK_MISMATCH: (i) => [
    { text: `Halt loading at dock ${i.target?.dock ?? ''}`, role: 'Floor supervisor' },
    { text: 'Re-scan bale against the manifest', role: 'Floor supervisor' },
    { text: 'Return mismatched bale to its slot', role: 'Floor supervisor' },
    { text: 'Supervisor sign-off on corrected manifest', role: 'Shift supervisor' },
  ],
  TILT: (i) => [
    { text: `Cordon a 5 m exclusion zone around ${i.target?.column ? `L-${i.target.column.lane}/R${i.target.column.row}` : 'the stack'}`, role: 'Floor supervisor' },
    { text: `Stop forklift operations in aisle ${laneLabelOf(i)}`, role: 'Floor supervisor' },
    { text: 'Structural engineer inspection', role: 'Maintenance' },
    { text: 'Controlled de-stack from the top level', role: 'Floor supervisor' },
    { text: 'Re-level the base and re-zero the gyro', role: 'Maintenance' },
  ],
  STRAP_SNAP: () => [
    { text: 'Cordon the bale — expansion hazard', role: 'Floor supervisor' },
    { text: 'Re-strap with hydraulic tensioner', role: 'Maintenance' },
    { text: 'Inspect neighbouring bale straps', role: 'Maintenance' },
    { text: 'Log strap batch for supplier QA', role: 'QC' },
  ],
};

/** `shift` rebases JSON ISO strings; runtime incidents already use epoch ms. */
function normalizeIncident(raw, shift = true) {
  const toMs = shift ? shiftTs : (v) => v ?? null;
  const inc = {
    ...raw,
    detectedAt: toMs(raw.detectedAt),
    resolvedAt: toMs(raw.resolvedAt),
    sensor: raw.sensor ? { ...raw.sensor, start: raw.sensor.value } : null,
    audit: (raw.audit ?? []).map((a) => ({ ...a, ts: toMs(a.ts) })),
    simulated: !!raw.simulated,
  };
  const steps = PLAYBOOKS[raw.type](inc);
  const doneList = raw.doneSteps === 'all' ? steps.map((_, i) => ({ i, ts: raw.resolvedAt, by: 'Shift team' })) : raw.doneSteps ?? [];
  const done = new Map(doneList.map((d) => [d.i, d]));
  inc.steps = steps.map((s, i) => ({ ...s, done: done.has(i), doneAt: done.has(i) ? toMs(done.get(i).ts) : null, by: done.get(i)?.by ?? null }));
  delete inc.doneSteps;
  return inc;
}

/** Facility Health Index: each category starts at 100 and loses points per open
 *  incident (acknowledged / in-progress ones count 60 %), then a weighted mean. */
const CAT_WEIGHT = { FIRE: 0.35, SECURITY: 0.25, STRUCTURAL: 0.25, PEST: 0.15 };
function computeHealth(incidents) {
  const cats = Object.fromEntries(CAT_ORDER.map((c) => [c, 100]));
  for (const i of incidents) {
    if (i.status === 'RESOLVED') continue;
    cats[i.category] -= SEVERITY[i.severity].penalty * (i.status === 'OPEN' ? 1 : 0.6);
  }
  for (const c of CAT_ORDER) cats[c] = clamp(cats[c], 0, 100);
  const overall = CAT_ORDER.reduce((s, c) => s + cats[c] * CAT_WEIGHT[c], 0);
  return { overall: Math.round(overall * 10) / 10, cats };
}
function healthBand(v) {
  if (v >= 90) return { label: 'Safe', icon: 'check', fg: 'text-[#0a8f0a] dark:text-[#3fcf3f]', fill: 'bg-[#0ca30c]' };
  if (v >= 75) return { label: 'Elevated risk', icon: 'alert', fg: 'text-[#b37900] dark:text-[#fab219]', fill: 'bg-[#fab219]' };
  if (v >= 60) return { label: 'High risk', icon: 'alert', fg: 'text-[#c2410c] dark:text-[#ec835a]', fill: 'bg-[#ec835a]' };
  return { label: 'Critical', icon: 'octagon', fg: 'text-[#d03b3b] dark:text-[#f07272]', fill: 'bg-[#d03b3b]' };
}

/* ---- Synthetic sensor telemetry (deterministic per sensor key) ---- */
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000003) / 1000003;
}
function baselineFor(metric, key) {
  const r = hash01(`${metric}:${key}`);
  switch (metric) {
    case 'coreTemp':
      return 26.5 + r * 5.5;
    case 'rh':
      return 52 + r * 12;
    case 'tilt':
      return 0.25 + r * 0.9;
    case 'rssi':
      return -54 - r * 12;
    case 'tension':
      return 3.9 + r * 0.5;
    default:
      return 0;
  }
}
const SERIES_STEP = 30 * MIN;
const SERIES_POINTS = 48;
/** 24 h of readings on a fixed 30-minute grid plus a live point at `now`.
 *  `inc` bends the curve so it ends at the incident's live reading. */
function sensorSeries(metric, key, now, { base, inc } = {}) {
  const b = base ?? baselineFor(metric, key);
  const gridEnd = Math.floor(now / SERIES_STEP) * SERIES_STEP;
  const times = Array.from({ length: SERIES_POINTS }, (_, i) => gridEnd - (SERIES_POINTS - 1 - i) * SERIES_STEP);
  times.push(now);
  const cur = inc?.sensor?.value;
  const td = inc?.detectedAt;
  const resolvedAt = inc?.resolvedAt;
  return times.map((t) => {
    const n = hash01(`${key}:${metric}:${Math.round(t / (5 * MIN))}`) - 0.5;
    const hour = new Date(t).getHours() + new Date(t).getMinutes() / 60;
    const diurnal = Math.sin(((hour - 9) / 24) * Math.PI * 2);
    let v;
    if (metric === 'coreTemp') v = b + 1.2 * diurnal + n * 0.6;
    else if (metric === 'rh') v = b - 3 * diurnal + n * 1.6;
    else if (metric === 'tilt') v = b + n * 0.06;
    else if (metric === 'rssi') v = b + n * 4;
    else v = b + n * 0.08;
    if (inc && td != null) {
      if (metric === 'rssi') {
        if (t >= td && (resolvedAt == null || t < resolvedAt)) return { t, v: null };
      } else if (metric === 'tension') {
        if (t >= td && (resolvedAt == null || t < resolvedAt)) v = (cur ?? 0) + Math.abs(n) * 0.04;
      } else if (cur != null) {
        const lead = metric === 'coreTemp' ? 5 * HOUR : metric === 'rh' ? 7 * HOUR : 4 * HOUR;
        const start = td - lead;
        if (t >= start) {
          const k = clamp((t - start) / Math.max(1, now - start), 0, 1);
          v += (cur - b) * Math.pow(k, metric === 'coreTemp' ? 1.7 : 1.2);
        }
      }
    }
    return { t, v: Math.round(v * 100) / 100 };
  });
}

/* ---- Derived risk state for the UI and the 3D engine ---- */
function deriveRisk(incidents) {
  const open = incidents.filter((i) => i.status !== 'RESOLVED').sort(bySeverity);
  const byBale = new Map();
  for (const i of open) {
    if (!i.baleId) continue;
    if (!byBale.has(i.baleId)) byBale.set(i.baleId, []);
    byBale.get(i.baleId).push(i);
  }
  const counts = Object.fromEntries(CAT_ORDER.map((c) => [c, { open: 0, resolved: 0, CRITICAL: 0, WARNING: 0, INFO: 0 }]));
  for (const i of incidents) {
    const c = counts[i.category];
    if (i.status === 'RESOLVED') c.resolved += 1;
    else {
      c.open += 1;
      c[i.severity] += 1;
    }
  }
  const severityTotals = { CRITICAL: 0, WARNING: 0, INFO: 0 };
  open.forEach((i) => (severityTotals[i.severity] += 1));
  const health = computeHealth(incidents);

  const zones = ZONES.map((z) => {
    const zi = open.filter((i) => i.zone === z.id);
    const rhInc = zi.find((i) => i.type === 'RH_HIGH' || i.type === 'RH_LOW');
    const thermal = zi.filter((i) => i.type === 'THERMAL');
    const triggered = zi.some((i) => i.type === 'SMOKE' && i.severity === 'CRITICAL') || thermal.some((i) => i.sensor.value >= 62);
    const active = thermal.some((i) => i.severity === 'CRITICAL');
    return { ...z, rh: rhInc ? rhInc.sensor.value : z.rh, suppressionState: triggered ? 'TRIGGERED' : active ? 'ACTIVE' : 'STANDBY', openCount: zi.length };
  });
  const traps = TRAPS.map((t) => {
    const ti = open.filter((i) => i.target?.trap === t.id || i.trap === t.id);
    let status = 'ARMED';
    if (ti.some((i) => i.type === 'TRAP')) status = 'TRIGGERED';
    else if (ti.some((i) => i.type === 'NESTING')) status = 'ACTIVITY';
    else if (ti.some((i) => i.type === 'TRAP_SERVICE')) status = 'LOW_BATTERY';
    return { ...t, status, battery: status === 'LOW_BATTERY' ? 9 : Math.round(55 + hash01(`bat${t.id}`) * 44), incident: ti[0]?.id ?? null };
  });
  const beams = Object.fromEntries(SAFETY.beams.map((b) => [b.id, open.some((i) => i.target?.beam === b.id) ? 'BREACHED' : 'ARMED']));
  const docks = SAFETY.docks.map((d) => {
    const alert = open.find((i) => i.target?.dock === d.id);
    return { ...d, state: alert ? 'Halted' : d.state, alert: alert?.id ?? null };
  });
  const dockHalted = docks.some((d) => d.alert);
  const fleet = SAFETY.fleet.map((f) => (f.id === 'FL-05' && !dockHalted ? { ...f, state: 'Working', task: 'Loading SO-15-7790 at X-1' } : f));

  const tilt = new Map();
  for (const i of open) if (i.type === 'TILT' && i.target?.column) tilt.set(`${i.target.column.lane}:${i.target.column.row}`, i.sensor.value);
  const columnTilts = [];
  for (const lane of LANE_INFO.keys()) {
    for (let r = 1; r <= ROWS; r++) {
      const key = `${lane}:${r}`;
      columnTilts.push({ lane, row: r, key, deg: tilt.get(key) ?? Math.round(baselineFor('tilt', key) * 100) / 100 });
    }
  }
  columnTilts.sort((a, b) => b.deg - a.deg);
  const blockedLanes = open.filter((i) => i.type === 'BLOCKAGE' && i.target?.aisle).map((i) => i.target.aisle.lane);
  const ghost = new Set(open.filter((i) => i.type === 'RFID_LOST' && i.baleId).map((i) => i.baleId));

  // Heat-map sources
  const colTemp = new Map();
  for (const lane of LANE_INFO.keys()) for (let r = 1; r <= ROWS; r++) colTemp.set(`${lane}:${r}`, baselineFor('coreTemp', `col:${lane}:${r}`) - 1.5);
  for (const i of incidents) {
    if (i.type !== 'THERMAL' || !i.target?.slot) continue;
    const s = SLOT_BY_KEY.get(i.target.slot);
    const k = `${s.lane}:${s.row}`;
    colTemp.set(k, Math.max(colTemp.get(k), i.sensor.value));
  }
  const thermal = [...colTemp].map(([k, v]) => {
    const [lane, row] = k.split(':').map(Number);
    return { x: LANE_INFO.get(lane).x, z: laneZ(lane, row), v };
  });
  const humidity = zones.map((z) => ({ x: z.cx, z: z.cz, v: z.rh }));
  const risk = open
    .map((i) => {
      const a = incidentAnchor(i);
      return a && { x: a.x, z: a.z, w: SEVERITY[i.severity].weight * (i.status === 'OPEN' ? 1 : 0.7) };
    })
    .filter(Boolean);

  const thermalOpen = open.filter((i) => (i.type === 'THERMAL' || i.type === 'SMOKE') && i.severity !== 'INFO');
  const maxCore = Math.max(...thermal.map((s) => s.v));
  return {
    open,
    byBale,
    counts,
    severityTotals,
    health,
    zones,
    traps,
    beams,
    docks,
    fleet,
    tilt,
    columnTilts,
    blockedLanes,
    ghost,
    heat: { thermal, humidity, risk },
    kpi: {
      thermal: thermalOpen.length,
      maxCore,
      primedZones: zones.filter((z) => z.suppressionState !== 'STANDBY').length,
      security: open.filter((i) => i.category === 'SECURITY' && i.severity !== 'INFO').length,
      securityTypes: [...new Set(open.filter((i) => i.category === 'SECURITY').map((i) => INCIDENT_TYPES[i.type]))],
      pestActive: traps.filter((t) => t.status === 'TRIGGERED' || t.status === 'ACTIVITY').length,
      pestTriggered: traps.filter((t) => t.status === 'TRIGGERED').length,
      pestActivity: traps.filter((t) => t.status === 'ACTIVITY').length,
    },
  };
}

/* ---- Live hazard simulation (randomness stays outside the reducer) ---- */
const ACTOR = 'You · Shift supervisor';
function makeRandomIncident(incidents, bales, now) {
  const simOpen = incidents.filter((i) => i.simulated && i.status !== 'RESOLVED').length;
  if (simOpen >= 3) return null;
  const id = `INC-${1501 + incidents.filter((i) => i.simulated).length}`;
  const roll = Math.random();
  const stored = bales.filter((b) => b.slot && b.status === 'STORED' && !b.tracked);
  const audit = (actor, text) => [{ ts: now, actor, text }];
  let raw = null;
  if (roll < 0.35) {
    const busy = new Set(incidents.filter((i) => i.status !== 'RESOLVED').map((i) => i.target?.trap ?? i.trap));
    const pool = TRAPS.filter((t) => !busy.has(t.id));
    const t = pick(Math.random, pool);
    if (!t) return null;
    const ev = 1 + Math.floor(Math.random() * 3);
    raw = {
      category: 'PEST', type: 'TRAP', severity: 'INFO',
      title: `IR movement near trap #${pad2(t.id)}`,
      detail: `Infrared sensor on trap #${pad2(t.id)} (${t.where}) logged ${ev} movement event${ev > 1 ? 's' : ''}. The trap has not fired yet.`,
      target: { trap: t.id }, zone: t.lane ? zoneIdOfSlot({ lane: t.lane }) : null,
      sensor: { id: `TRAP-${pad2(t.id)}`, kind: 'IoT snap trap + IR', metric: 'events', value: ev, unit: 'IR events', limit: 0 },
      audit: audit(`TRAP-${pad2(t.id)}`, `${ev} IR event(s) detected`),
    };
  } else if (roll < 0.6 && stored.length) {
    const b = pick(Math.random, stored);
    const s = SLOT_BY_KEY.get(b.slot);
    const kn = Math.round((1.6 + Math.random() * 0.8) * 10) / 10;
    raw = {
      category: 'STRUCTURAL', type: 'STRAP_SNAP', severity: 'WARNING',
      title: `Strap tension low on bale ${b.id}`,
      detail: `Strain gauge on strap #${1 + Math.floor(Math.random() * 6)} reads ${kn} kN (minimum 2.5 kN). The strap may be stretching before it fails.`,
      baleId: b.id, zone: zoneIdOfSlot(s), target: { slot: b.slot },
      sensor: { id: `SG-${s.lane}-${s.shelf}${s.row}`, kind: 'Strap strain gauge', metric: 'tension', value: kn, unit: 'kN', limit: 2.5 },
      audit: audit('Strain gauge', `Tension ${kn} kN below 2.5 kN minimum`),
    };
  } else if (roll < 0.85 && stored.length) {
    const b = pick(Math.random, stored);
    const s = SLOT_BY_KEY.get(b.slot);
    const v = Math.round((45.2 + Math.random() * 2) * 10) / 10;
    raw = {
      category: 'FIRE', type: 'THERMAL', severity: 'WARNING',
      title: 'Elevated core temperature',
      detail: `Rack thermal camera reads ${v} °C in bale ${b.id} (watch level 45 °C).`,
      baleId: b.id, zone: zoneIdOfSlot(s), target: { slot: b.slot },
      sensor: { id: `TC-${pad2(s.lane)}-${s.shelf}`, kind: 'Rack thermal camera', metric: 'coreTemp', value: v, unit: '°C', limit: 45, ratePerHour: 0.8 },
      audit: audit(`TC-${pad2(s.lane)}-${s.shelf}`, 'Core temperature crossed 45 °C watch level'),
    };
  } else {
    const lane = pick(Math.random, [...LANE_INFO.keys()]);
    const row = 1 + Math.floor(Math.random() * ROWS);
    const deg = Math.round((2.0 + Math.random() * 0.6) * 10) / 10;
    raw = {
      category: 'STRUCTURAL', type: 'TILT', severity: 'INFO',
      title: `Stack L-${lane}/R${row} at ${deg}° — monitoring`,
      detail: `Gyro GY-${pad2(lane)}-${pad2(row)} reports a ${deg}° lean, below the 3° warning level.`,
      zone: zoneIdOfSlot({ lane }), target: { column: { lane, row } },
      sensor: { id: `GY-${pad2(lane)}-${pad2(row)}`, kind: 'Micro-gyro tilt sensor', metric: 'tilt', value: deg, unit: '°', limit: 3, ratePerHour: 0.08 },
      audit: audit(`GY-${pad2(lane)}-${pad2(row)}`, 'Lean above 2° monitoring level'),
    };
  }
  return normalizeIncident({ ...raw, id, status: 'OPEN', detectedAt: now, simulated: true }, false);
}

function planTelemetryTick(incidents, bales, now, dt) {
  const updates = {};
  for (const i of incidents) {
    const s = i.sensor;
    if (!s || s.value == null) continue;
    const jitter = Math.random() - 0.5;
    const resolved = i.status === 'RESOLVED';
    let v = s.value;
    if (s.metric === 'coreTemp') v = resolved ? v + (30 - v) * 0.06 : v + ((s.ratePerHour ?? 0) / 3600) * dt * (i.status === 'OPEN' ? 1 : 0.35) + jitter * 0.05;
    else if (s.metric === 'rh') v = v + ((resolved ? 60 : s.start) - v) * (resolved ? 0.08 : 0.05) + jitter * 0.5;
    else if (s.metric === 'tilt') v = resolved ? v + (0.4 - v) * 0.1 : v + ((s.ratePerHour ?? 0) / 3600) * dt * (i.status === 'OPEN' ? 1 : 0.3) + jitter * 0.01;
    else continue;
    if (resolved && Math.abs(v - s.value) < 0.01) continue;
    updates[i.id] = Math.round(v * 100) / 100;
  }
  const newIncident = Math.random() < dt / 50 ? makeRandomIncident(incidents, bales, now) : null;
  return { updates, newIncident };
}

function applyIncidentOp(inc, op, ts, step) {
  const withAudit = (text) => [...inc.audit, { ts, actor: ACTOR, text }];
  switch (op) {
    case 'ack':
      return inc.status === 'OPEN' ? { ...inc, status: 'ACKNOWLEDGED', audit: withAudit('Acknowledged — response started') } : inc;
    case 'step': {
      if (inc.status === 'RESOLVED') return inc;
      const steps = inc.steps.map((s, i) => (i !== step ? s : s.done ? { ...s, done: false, doneAt: null, by: null } : { ...s, done: true, doneAt: ts, by: ACTOR }));
      const s = steps[step];
      return { ...inc, steps, status: 'IN_PROGRESS', audit: withAudit(s.done ? `Step ${step + 1} done: ${s.text}` : `Step ${step + 1} re-opened`) };
    }
    case 'escalate': {
      if (inc.severity === 'CRITICAL') return inc;
      const next = inc.severity === 'INFO' ? 'WARNING' : 'CRITICAL';
      return { ...inc, severity: next, audit: withAudit(`Escalated to ${SEVERITY[next].label}`) };
    }
    case 'resolve':
      return { ...inc, status: 'RESOLVED', resolvedAt: ts, audit: withAudit('Resolved — all response steps complete') };
    case 'reopen':
      return { ...inc, status: 'IN_PROGRESS', resolvedAt: null, audit: withAudit('Re-opened for follow-up') };
    default:
      return inc;
  }
}
const hazardFeedItem = (inc, verb, ts) => ({
  id: `HAZ:${inc.id}:${verb}:${ts}`,
  kind: 'HAZARD',
  incidentId: inc.id,
  baleId: inc.baleId ?? null,
  ts,
  cat: inc.category,
  severity: inc.severity,
  slot: null,
  text: verb === 'detected' ? inc.title : `${verb}: ${inc.title}`,
});

/* ============================================================================
 * 4. FORMATTING · HOOKS · ICONS · META
 * ========================================================================== */
const DTF = {
  date: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
  dayMon: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }),
  time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
  timeS: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  long: new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
};
const fmtDateTime = (ms) => `${DTF.date.format(ms)} · ${DTF.time.format(ms)}`;
const fmtShort = (ms) => `${DTF.dayMon.format(ms)} · ${DTF.time.format(ms)}`;
function fmtDuration(ms, withSeconds = false) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  const tail = withSeconds ? ` ${sec}s` : '';
  if (d > 0) return `${d}d ${h}h ${String(m).padStart(2, '0')}m${tail}`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m${tail}`;
  if (m > 0) return `${m}m${tail}`;
  return `${s % 60}s`;
}
function fmtAgo(ms, now) {
  const d = now - ms;
  if (d < 0) return `in ${fmtDuration(-d)}`;
  if (d < 45_000) return 'just now';
  if (d < HOUR) return `${Math.max(1, Math.round(d / MIN))}m ago`;
  if (d < DAY) return `${Math.floor(d / HOUR)}h ago`;
  return `${Math.floor(d / DAY)}d ago`;
}

/** One shared 1 s ticker for every live counter on the page. */
const clockStore = (() => {
  let now = Date.now();
  let timer = null;
  const subs = new Set();
  return {
    subscribe(fn) {
      subs.add(fn);
      if (!timer) {
        now = Date.now();
        timer = setInterval(() => {
          now = Date.now();
          subs.forEach((f) => f());
        }, 1000);
      }
      return () => {
        subs.delete(fn);
        if (!subs.size && timer) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    get: () => now,
  };
})();
const useNow = () => useSyncExternalStore(clockStore.subscribe, clockStore.get, clockStore.get);

function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return undefined;
    let raf = 0;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / duration);
      const v = from + (target - from) * (1 - Math.pow(1 - k, 3));
      fromRef.current = v;
      setValue(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function useThemePreference() {
  // Light is the default; a theme the viewer picks with the toggle is remembered.
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('wh15-theme-v2');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      /* storage unavailable */
    }
    return 'light';
  });
  useEffect(() => {
    try {
      localStorage.setItem('wh15-theme-v2', theme);
    } catch {
      /* storage unavailable */
    }
    document.documentElement.style.colorScheme = theme;
    document.body.style.background = theme === 'dark' ? '#060a13' : '#eef2f7';
  }, [theme]);
  return [theme, setTheme];
}

const ICON_PATHS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  pin: <><path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  box: <><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /></>,
  truck: <><path d="M2 6h12v10H2zM14 9h4l3 3.5V16h-7" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  warehouse: <><path d="M3 21V9l9-5 9 5v12" /><path d="M7 21v-8h10v8M7 17h10" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />,
  play: <path d="M7 5v14l11-7z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  crosshair: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></>,
  rotate: <><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" /></>,
  grid: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>,
  cube: <><path d="M12 2 3 7v10l9 5 9-5V7z" /><path d="m3 7 9 5 9-5M12 12v10" /></>,
  aisle: <><path d="M4 21 9 3M20 21 15 3" /><path d="M12 5v2.5M12 10.5v3M12 16.5v4" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
  factory: <><path d="M3 21V11l6 3.5V11l6 3.5V7l6-3v17z" /><path d="M7 18h2M12 18h2M17 18h2" /></>,
  route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" /></>,
  alert: <><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9.5v4M12 17h.01" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></>,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  gateIn: <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5M15 12H3" /></>,
  gateOut: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />,
  shield: <><path d="M12 3 4.5 6v6c0 4.4 3.1 8.1 7.5 9 4.4-.9 7.5-4.6 7.5-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  move: <><path d="M5 9 2 12l3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" /></>,
  scale: <><path d="M12 3v18M7 21h10M5 7h14" /><path d="m5 7-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z" /></>,
  palette: <><circle cx="12" cy="12" r="9" /><circle cx="8" cy="10" r="1.2" /><circle cx="12" cy="7.5" r="1.2" /><circle cx="16" cy="10" r="1.2" /><path d="M12 21a2.5 2.5 0 0 1 0-5h2a3 3 0 0 0 3-3" /></>,
  sort: <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  flame: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.6 2.3-4.6.2 1.6 1 2.6 2 2.9C11 9 11 6 12 3z" />,
  rodent: <><path d="M3 16c0-3.6 3.4-6.5 7.5-6.5 3.8 0 6.9 2.4 7.4 5.6l2.6 1-2.7 1c-.7 1.9-2.6 2.9-4.8 2.9H7" /><circle cx="15.5" cy="8" r="2" /><path d="M3 16c-.8 1.6.2 3.9 2.8 3.9" /></>,
  stack: <><path d="M6.5 3.5 16 4.6l-.5 4.6L6 8.1z" /><path d="M5.5 10.2h10.5v4.6H5.5z" /><path d="M4.5 16.6H16v4H4.5z" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  octagon: <><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" /><path d="M12 8v5M12 16h.01" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 21h4" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  drone: <><circle cx="5" cy="5" r="2.5" /><circle cx="19" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" /><path d="m7 7 3 3M17 7l-3 3M7 17l3-3M17 17l-3-3" /><rect x="10" y="10" width="4" height="4" rx="1" /></>,
  heat: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="10" r="2.5" /><circle cx="15.5" cy="15" r="3.5" /></>,
  evac: <><path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" /><circle cx="7" cy="5" r="1.6" /><path d="m5 21 2-6 3 2v4M9 9l-3 2v3M7 9l3 3 2-1" /><path d="M13 12h5M16 9.5l2.5 2.5-2.5 2.5" /></>,
  droplet: <path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" />,
  thermo: <><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z" /><path d="M12 10v6" /></>,
  radio: <><path d="M5.5 9a8 8 0 0 1 13 0M8 11.5a4.5 4.5 0 0 1 8 0" /><circle cx="12" cy="14" r="1.3" /><path d="M12 15.5V21" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  siren: <><path d="M7 18v-6a5 5 0 0 1 10 0v6" /><path d="M5 18h14v3H5zM12 3v2M4.2 6.2l1.4 1.4M19.8 6.2l-1.4 1.4M2 12h2M20 12h2" /></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.3 4.5 4.5 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />,
  camera: <><path d="M3 8h3l2-3h8l2 3h3v12H3z" /><circle cx="12" cy="13" r="3.5" /></>,
  hydrant: <><path d="M8 21V10a4 4 0 0 1 8 0v11M6 21h12M5 13h3M16 13h3M10 4h4" /></>,
};

/** OPTIMON brand mark, redrawn as SVG from the supplied logo. The wordmark switches
 *  to white in dark mode so it stays legible; the infinity mark keeps its red. */
function OptimonLogo({ className = 'h-6 w-auto', markOnly = false }) {
  return (
    <svg viewBox={markOnly ? '0 0 520 224' : '0 0 1900 224'} className={className} role="img" aria-label="OPTIMON">
      <path
        d="M170.3 39.3 L349.7 184.7 A93.5 93.5 0 1 0 349.7 39.3 L170.3 184.7 A93.5 93.5 0 1 1 170.3 39.3 Z"
        fill="none"
        stroke="#c00032"
        strokeWidth="37"
        strokeLinejoin="round"
      />
      {!markOnly && (
        <text
          x="622"
          y="194"
          textLength="1278"
          lengthAdjust="spacingAndGlyphs"
          className="fill-[#002d6e] dark:fill-white"
          style={{ font: '700 232px Montserrat, Inter, "Segoe UI", Arial, sans-serif' }}
        >
          OPTIMON
        </text>
      )}
    </svg>
  );
}
function Icon({ name, className = 'h-4 w-4', strokeWidth = 1.8 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

/* Status colours: validated categorical order (yellow · aqua · blue · orange) +
 * a neutral gray. Every use pairs the colour with an icon and a text label. */
const STATUS_META = {
  IN_TRANSIT: { label: 'In-Transit', icon: 'truck', hex: '#eda100', hexDark: '#c98500', dot: 'bg-[#eda100] dark:bg-[#c98500]', fg: 'text-[#b37900] dark:text-[#eda100]', solid: 'bg-[#eda100] text-[#0b0b0b] dark:bg-[#c98500]' },
  RECEIVING: { label: 'Receiving', icon: 'gateIn', hex: '#1baf7a', hexDark: '#199e70', dot: 'bg-[#1baf7a] dark:bg-[#199e70]', fg: 'text-[#16865e] dark:text-[#1baf7a]', solid: 'bg-[#1baf7a] text-white dark:bg-[#199e70]' },
  STORED: { label: 'Stored', icon: 'box', hex: '#2a78d6', hexDark: '#3987e5', dot: 'bg-[#2a78d6] dark:bg-[#3987e5]', fg: 'text-[#2a78d6] dark:text-[#6da7ec]', solid: 'bg-[#2a78d6] text-white dark:bg-[#3987e5]' },
  QC_HOLD: { label: 'QC Hold', icon: 'alert', hex: '#eb6834', hexDark: '#d95926', dot: 'bg-[#eb6834] dark:bg-[#d95926]', fg: 'text-[#c94f1e] dark:text-[#eb6834]', solid: 'bg-[#eb6834] text-white dark:bg-[#d95926]' },
  DISPATCHED: { label: 'Dispatched', icon: 'gateOut', hex: '#898781', hexDark: '#898781', dot: 'bg-[#898781]', fg: 'text-[#6f6d68] dark:text-[#b0aea6]', solid: 'bg-[#898781] text-white' },
};
const STATUS_ORDER = ['IN_TRANSIT', 'RECEIVING', 'STORED', 'QC_HOLD', 'DISPATCHED'];
const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'WATCH', label: 'Watchlist', icon: 'star', iconCls: 'fill-amber-400 text-amber-400' },
  { key: 'AT_RISK', label: 'At risk', icon: 'alert', iconCls: 'text-[#d03b3b] dark:text-[#f07272]' },
  ...STATUS_ORDER.map((k) => ({ key: k, label: STATUS_META[k].label, status: k })),
];
const EVENT_ICON = {
  PRODUCED: 'factory',
  QC_GRADED: 'shield',
  TW_IN: 'gateIn',
  TW_OUT: 'gateOut',
  WH_IN: 'warehouse',
  STORED: 'box',
  RELOCATED: 'move',
  QC_HOLD: 'alert',
  PICKED: 'layers',
  DISPATCHED: 'truck',
  EXPECTED: 'clock',
};
const SEGMENT_LABEL = {
  'PRODUCED>QC_GRADED': 'HVI grading',
  'QC_GRADED>TW_IN': 'Gin → TW-3 haul',
  'PRODUCED>TW_IN': 'Gin → TW-3 haul',
  'TW_IN>TW_OUT': 'Held at Transit WH 3',
  'TW_OUT>STORED': 'Transit to WH 15-1 + put-away',
  'TW_OUT>WH_IN': 'Transit to WH 15-1',
  'TW_OUT>EXPECTED': 'Expected transit time',
  'WH_IN>STORED': 'Receiving → put-away',
  'STORED>RELOCATED': 'In storage',
  'STORED>QC_HOLD': 'In storage',
  'RELOCATED>QC_HOLD': 'In storage',
  'STORED>PICKED': 'Storage dwell',
  'RELOCATED>PICKED': 'Storage dwell',
  'PICKED>DISPATCHED': 'Loading at X-1',
};
const CSS = `
@keyframes wh-fade-up{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes wh-delta{0%{opacity:0;transform:translateY(3px)}12%{opacity:1;transform:none}85%{opacity:1}100%{opacity:0}}
@keyframes wh-march{to{background-position:24px 0}}
@keyframes wh-slide-in{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}
.wh-scroll{scrollbar-width:thin;scrollbar-color:rgba(100,116,139,.35) transparent}
.wh-scroll::-webkit-scrollbar{width:8px;height:8px}
.wh-scroll::-webkit-scrollbar-thumb{background:rgba(100,116,139,.35);border-radius:8px;border:2px solid transparent;background-clip:padding-box}
.wh-march{background-image:repeating-linear-gradient(90deg,currentColor 0 6px,transparent 6px 12px);background-size:24px 2px;animation:wh-march 1s linear infinite}
`;

/* ============================================================================
 * 5. THREE.JS ENGINE
 * ----------------------------------------------------------------------------
 * Imperative and framework-free: React hands it data through setData /
 * setSelection / setTheme and receives picks & hovers through cbRef.
 * ========================================================================== */
const ACCENT = '#22d3ee';
const ENTRY_COLOR = '#22c55e';
const EXIT_COLOR = '#ef4444';
const AGE_STOPS = ['#fde0cf', '#f29a6b', '#c4521c', '#7c2d0e'];
const AGE_MAX_DAYS = 45;
const INBOUND_TRUCK = new THREE.Vector3(-(DIM.bx + 8.5), 0, -1.6);
const OUTBOUND_TRUCK = new THREE.Vector3(DIM.bx + 7.5, 0, -1.6);
const LOAD_SPOTS = [];
for (const lvl of [0, 1]) for (const x of [-3.25, -1.8, -0.35, 1.1]) for (const z of [-0.58, 0.58]) LOAD_SPOTS.push(new THREE.Vector3(x, 0.93 + DIM.bale.h / 2 + lvl * (DIM.bale.h + 0.03), z));
/** Receiving bay (entry side) and dispatch staging (exit side): pallet pads in two columns either
 *  side of a forklift lane, three rows deep. Turret trucks drive down the lane and swing the forks
 *  sideways to pick or set down a bale, exactly as they do in the rack aisles. */
function bayPads(side) {
  const laneX = side * (DIM.bx - 2.25);
  const pads = [];
  for (const z of [6.0, 4.8, 3.6]) for (const off of [-1.35, 1.35]) pads.push(new THREE.Vector3(laneX + off * side, 0.14 + DIM.bale.h / 2, z));
  return { laneX, pads };
}
const IN_BAY = bayPads(-1);
const OUT_BAY = bayPads(1);
const RECEIVING_SPOTS = IN_BAY.pads;

const PALETTES = {
  dark: {
    background: '#060a13', fogNear: 95, fogFar: 200, yard: '#0a0f1a', road: '#0e1523', roadMark: '#3b4658',
    floor: '#0f1727', grid: '#18233a', aisle: '#0b1220', laneFloor: '#122036', edgeLine: '#eab308', centerLine: '#94a3b8',
    stopLine: '#64748b', label: '#6b7a90', labelStrong: '#cbd5e1', upright: '#3a4a63', beam: '#c2410c', deck: '#1f2b3e',
    emptyFill: '#86efac', emptyFillOpacity: 0.12, emptyEdge: '#4ade80', emptyEdgeOpacity: 0.55, wallLine: '#22d3ee', wallLineOpacity: 0.28,
    curb: '#1e293b', pillar: '#1f2a3d', facility: '#142034', facilityOpacity: 0.88, facilityEdge: '#334155', bale: '#efe5cf',
    hemiSky: '#b4c6e4', hemiGround: '#0b1220', hemiIntensity: 1.05, sunIntensity: 1.8, zoneOpacity: 0.3, hover: '#ffffff', charge: '#16233a',
  },
  light: {
    background: '#e8edf4', fogNear: 120, fogFar: 240, yard: '#d9e0ea', road: '#c9d2de', roadMark: '#f8fafc',
    floor: '#f7f9fc', grid: '#dde4ee', aisle: '#e4e9f1', laneFloor: '#edf1f7', edgeLine: '#ca8a04', centerLine: '#64748b',
    stopLine: '#94a3b8', label: '#7b8798', labelStrong: '#1e293b', upright: '#8796ab', beam: '#ea580c', deck: '#cfd8e3',
    emptyFill: '#86efac', emptyFillOpacity: 0.26, emptyEdge: '#4ade80', emptyEdgeOpacity: 0.9, wallLine: '#0891b2', wallLineOpacity: 0.4,
    curb: '#cbd5e1', pillar: '#b9c4d3', facility: '#e2e8f0', facilityOpacity: 0.92, facilityEdge: '#94a3b8', bale: '#e9dcc0',
    hemiSky: '#ffffff', hemiGround: '#aab4c3', hemiIntensity: 1.2, sunIntensity: 2.1, zoneOpacity: 0.4, hover: '#0f172a', charge: '#dbe3ee',
  },
};

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Renders one or more text lines to a canvas (used for floor paint and sprites). */
function labelCanvas(lines, { padX = 22, padY = 12, bg = null, border = null, radius = 16, lineGap = 4 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const sans = 'Inter, "Segoe UI", system-ui, Arial, sans-serif';
  const mono = '"JetBrains Mono", Consolas, monospace';
  const measured = lines.map((l) => {
    ctx.font = `${l.weight ?? 700} ${l.size}px ${l.mono ? mono : sans}`;
    return { ...l, font: ctx.font, w: ctx.measureText(l.text).width };
  });
  const w = Math.ceil(Math.max(...measured.map((m) => m.w)) + padX * 2);
  const h = Math.ceil(measured.reduce((s, m) => s + m.size * 1.2, 0) + lineGap * (lines.length - 1) + padY * 2);
  c.width = w;
  c.height = h;
  if (bg) {
    roundRectPath(ctx, 2, 2, w - 4, h - 4, radius);
    ctx.fillStyle = bg;
    ctx.fill();
    if (border) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = border;
      ctx.stroke();
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = padY;
  for (const m of measured) {
    ctx.font = m.font;
    ctx.fillStyle = m.color ?? '#ffffff';
    ctx.fillText(m.text, w / 2, y + (m.size * 1.2) / 2);
    y += m.size * 1.2 + lineGap;
  }
  return c;
}

function baleCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  const rng = mulberry32(7);
  for (let i = 0; i < 1100; i++) {
    const v = 205 + Math.floor(rng() * 50);
    ctx.fillStyle = `rgba(${v},${v},${v - 8},0.55)`;
    ctx.fillRect(rng() * 128, rng() * 128, 1 + rng() * 3, 1);
  }
  ctx.strokeStyle = 'rgba(110,100,80,0.07)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 128; i += 4) {
    ctx.beginPath();
    ctx.moveTo(0, i + 0.5);
    ctx.lineTo(128, i + 0.5);
    ctx.moveTo(i + 0.5, 0);
    ctx.lineTo(i + 0.5, 128);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(60,54,44,0.55)';
  for (const x of [28, 61, 94]) ctx.fillRect(x, 0, 6, 128);
  const g = ctx.createRadialGradient(64, 64, 28, 64, 64, 96);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}

function stripeCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 9;
  for (let i = -64; i <= 128; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 64);
    ctx.lineTo(i + 64, 0);
    ctx.stroke();
  }
  return c;
}

function flowCanvas() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.fillRect(0, 0, 128, 32);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(46, 4);
  ctx.lineTo(74, 16);
  ctx.lineTo(46, 28);
  ctx.stroke();
  return c;
}

function gradientCanvas() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  return c;
}

function glowCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}

/* 24-unit SVG glyphs drawn into the floating 3D risk markers (Path2D). */
const CAT_GLYPH = {
  FIRE: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.6 2.3-4.6.2 1.6 1 2.6 2 2.9C11 9 11 6 12 3z',
  SECURITY: 'M12 3 4.5 6v6c0 4.4 3.1 8.1 7.5 9 4.4-.9 7.5-4.6 7.5-9V6zM9 12l2 2 4-4',
  PEST: 'M3 16c0-3.6 3.4-6.5 7.5-6.5 3.8 0 6.9 2.4 7.4 5.6l2.6 1-2.7 1c-.7 1.9-2.6 2.9-4.8 2.9H7M3 16c-.8 1.6.2 3.9 2.8 3.9M13.5 8a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  STRUCTURAL: 'M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9.5v4M12 17h.01',
};
/** Compact alert badge: category colour + glyph, outer ring = severity
 *  (red critical · amber warning · white info). Text lives in the hover tooltip. */
function badgeCanvas(inc) {
  const cat = HAZARD_CATS[inc.category];
  const S = 76;
  const R = S / 2;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.beginPath();
  ctx.arc(R, R, R - 2, 0, Math.PI * 2);
  ctx.fillStyle = inc.severity === 'CRITICAL' ? '#d03b3b' : inc.severity === 'WARNING' ? '#fab219' : '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(8,13,26,0.55)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(R, R, R - 10, 0, Math.PI * 2);
  ctx.fillStyle = cat.hex;
  ctx.fill();
  ctx.save();
  ctx.translate(R - 16.8, R - 16.8);
  ctx.scale(1.4, 1.4);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(CAT_GLYPH[inc.category]));
  ctx.restore();
  return c;
}

/** Lane monitor screen: lane ID, occupancy %, a rows × shelves slot map
 *  (cream = bale, green = available, orange = QC hold, violet = tag lost) and counts. */
function laneMonitorCanvas({ lane, filled, cap, cells, alerts, selectedCell, flip = false, flash = new Map() }) {
  const W = 320;
  const H = 200;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const sans = 'Inter, "Segoe UI", system-ui, sans-serif';
  const mono = '"JetBrains Mono", Consolas, monospace';
  roundRectPath(ctx, 0, 0, W, H, 20);
  ctx.fillStyle = '#05080f';
  ctx.fill();
  roundRectPath(ctx, 8, 8, W - 16, H - 16, 13);
  const bg = ctx.createLinearGradient(0, 8, 0, H - 8);
  bg.addColorStop(0, '#11223d');
  bg.addColorStop(1, '#0a1427');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(56,189,248,0.45)';
  ctx.stroke();

  const pct = filled / cap;
  const tone = pct >= 0.95 ? '#f87171' : pct >= 0.8 ? '#fbbf24' : '#38bdf8';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 34px ${sans}`;
  ctx.fillText(`L-${lane}`, 24, 38);
  ctx.textAlign = 'right';
  ctx.fillStyle = tone;
  ctx.font = `700 28px ${mono}`;
  ctx.fillText(`${Math.round(pct * 100)}%`, W - 22, 39);
  if (alerts.count) {
    const ax = W - 22 - ctx.measureText(`${Math.round(pct * 100)}%`).width - 26;
    ctx.beginPath();
    ctx.arc(ax, 38, 13, 0, Math.PI * 2);
    ctx.fillStyle = alerts.sev === 'CRITICAL' ? '#d03b3b' : alerts.sev === 'WARNING' ? '#fab219' : '#64748b';
    ctx.fill();
    ctx.fillStyle = alerts.sev === 'WARNING' ? '#0b0b0b' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = `800 17px ${sans}`;
    ctx.fillText(String(alerts.count), ax, 39);
  }

  // Slot map: one column per row, shelves stacked A (bottom) → E (top). `flip` mirrors the rows
  // so the map reads the same way round as the rack seen from the camera's side of the lane.
  const gx0 = 24;
  const gx1 = W - 24;
  const gy0 = 60;
  const gy1 = 144;
  const gap = 4;
  const cols = cells.length;
  const levels = cells[0].length;
  const cw = (gx1 - gx0 - gap * (cols - 1)) / cols;
  const ch = (gy1 - gy0 - gap * (levels - 1)) / levels;
  const colX = (r) => gx0 + (flip ? cols - 1 - r : r) * (cw + gap);
  const FILL = { filled: '#efe3c6', qc: '#eb6834', ghost: '#9a8fc4' };
  cells.forEach((col, r) => {
    col.forEach((state, l) => {
      const x = colX(r);
      const y = gy1 - (l + 1) * ch - l * gap;
      const fl = flash.get(`${r},${l}`);
      if (fl) {
        // Just filled / just emptied: a glow so the change is easy to spot.
        ctx.save();
        ctx.shadowColor = fl.add ? '#4ade80' : '#fbbf24';
        ctx.shadowBlur = 14;
        roundRectPath(ctx, x - 2, y - 2, cw + 4, ch + 4, 4);
        ctx.fillStyle = fl.add ? '#4ade80' : '#fbbf24';
        ctx.fill();
        ctx.restore();
      }
      roundRectPath(ctx, x, y, cw, ch, 3);
      if (state === 'free') {
        ctx.fillStyle = fl ? '#0a1427' : 'rgba(74,222,128,0.22)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#4ade80';
        ctx.stroke();
      } else {
        ctx.fillStyle = FILL[state];
        ctx.fill();
      }
      if (selectedCell && selectedCell[0] === r && selectedCell[1] === l) {
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#22d3ee';
        ctx.stroke();
      }
    });
  });
  ctx.font = `600 12px ${mono}`;
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'center';
  ctx.fillText('R1', colX(0) + cw / 2, gy1 + 11);
  ctx.fillText(`R${cols}`, colX(cols - 1) + cw / 2, gy1 + 11);

  ctx.textAlign = 'left';
  ctx.font = `700 21px ${sans}`;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(`${filled} filled`, 24, 176);
  let delta = 0;
  for (const f of flash.values()) delta += f.add ? 1 : -1;
  if (delta) {
    const dx = 24 + ctx.measureText(`${filled} filled`).width + 8;
    const txt = delta > 0 ? `+${delta}` : `−${-delta}`;
    ctx.font = `800 15px ${mono}`;
    const tw = ctx.measureText(txt).width + 12;
    roundRectPath(ctx, dx, 165, tw, 22, 11);
    ctx.fillStyle = delta > 0 ? '#16a34a' : '#d97706';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(txt, dx + tw / 2, 177);
    ctx.font = `700 21px ${sans}`;
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = '#4ade80';
  ctx.fillText(`${cap - filled} free`, W - 24, 176);

  const glare = ctx.createLinearGradient(0, 0, W * 0.7, H);
  glare.addColorStop(0, 'rgba(255,255,255,0.08)');
  glare.addColorStop(0.5, 'rgba(255,255,255,0)');
  roundRectPath(ctx, 8, 8, W - 16, H - 16, 13);
  ctx.fillStyle = glare;
  ctx.fill();
  return c;
}

function markerCanvas(inc, text, selected) {
  const cat = HAZARD_CATS[inc.category];
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const H = 72;
  const pad = 6;
  const font = '700 32px Inter, "Segoe UI", system-ui, sans-serif';
  ctx.font = font;
  const W = Math.ceil(H + 12 + ctx.measureText(text).width + 24);
  c.width = W + pad * 2;
  c.height = H + pad * 2;
  ctx.font = font;
  roundRectPath(ctx, pad, pad, W, H, H / 2);
  ctx.fillStyle = 'rgba(8,13,26,0.92)';
  ctx.fill();
  ctx.lineWidth = selected ? 6 : 4;
  ctx.strokeStyle = selected ? '#ffffff' : cat.aura;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(pad + H / 2, pad + H / 2, H / 2 - 7, 0, Math.PI * 2);
  ctx.fillStyle = cat.hex;
  ctx.fill();
  ctx.save();
  ctx.translate(pad + H / 2 - 18, pad + H / 2 - 18);
  ctx.scale(1.5, 1.5);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(CAT_GLYPH[inc.category]));
  ctx.restore();
  if (inc.severity === 'CRITICAL') {
    ctx.beginPath();
    ctx.arc(pad + H - 10, pad + 12, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#d03b3b';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, pad + H + 10, pad + H / 2 + 1);
  return c;
}

/* Heat-map colour ramps. Thermal & risk: one hue, light → dark (sequential).
 * Humidity: diverging — dry (orange) ← neutral grey 55 % → wet (blue). */
const HEAT_STOPS = [
  [0, [254, 229, 217, 0]],
  [0.18, [252, 187, 161, 110]],
  [0.42, [251, 106, 74, 180]],
  [0.7, [222, 45, 38, 222]],
  [1, [153, 0, 13, 245]],
];
const HEAT_CSS = 'linear-gradient(90deg, rgba(254,229,217,0.2), rgba(252,187,161,0.6), rgb(251,106,74), rgb(222,45,38), rgb(153,0,13))';
const HUMIDITY_CSS = 'linear-gradient(90deg, #d95926, #969696 50%, #2a78d6)';
function rampHeat(t) {
  for (let k = 1; k < HEAT_STOPS.length; k++) {
    if (t <= HEAT_STOPS[k][0]) {
      const [t0, a] = HEAT_STOPS[k - 1];
      const [t1, b] = HEAT_STOPS[k];
      const u = (t - t0) / (t1 - t0);
      return a.map((v, i) => Math.round(v + (b[i] - v) * u));
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1];
}
function rampHumidity(v) {
  const wet = v >= 55;
  const t = wet ? clamp((v - 55) / 35, 0, 1) : clamp((55 - v) / 30, 0, 1);
  const to = wet ? [42, 120, 214] : [217, 89, 38];
  return [Math.round(150 + (to[0] - 150) * t), Math.round(150 + (to[1] - 150) * t), Math.round(150 + (to[2] - 150) * t), Math.round(30 + 205 * t)];
}

/** Straight segments joined by quadratic fillets — clean forklift-style routes. */
function roundedPolyline(points, radius = 0.85) {
  const path = new THREE.CurvePath();
  const pts = points.filter((p, i) => i === 0 || p.distanceToSquared(points[i - 1]) > 1e-6);
  if (pts.length < 2) return null;
  let prev = pts[0].clone();
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const ab = b.clone().sub(a);
    const bc = c.clone().sub(b);
    const r = Math.min(radius, ab.length() / 2, bc.length() / 2);
    const p1 = b.clone().sub(ab.normalize().multiplyScalar(r));
    const p2 = b.clone().add(bc.normalize().multiplyScalar(r));
    if (prev.distanceToSquared(p1) > 1e-6) path.add(new THREE.LineCurve3(prev.clone(), p1));
    path.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2));
    prev = p2;
  }
  path.add(new THREE.LineCurve3(prev, pts[pts.length - 1].clone()));
  return path;
}

function ageColor(target, days) {
  const t = clamp(days / AGE_MAX_DAYS, 0, 1) * (AGE_STOPS.length - 1);
  const i = Math.min(AGE_STOPS.length - 2, Math.floor(t));
  const a = new THREE.Color(AGE_STOPS[i]);
  const b = new THREE.Color(AGE_STOPS[i + 1]);
  return target.lerpColors(a, b, t - i);
}
const firstStoredTs = (b) => b.history.find((h) => h.type === 'STORED')?.ts ?? lastTs(b);

function createWarehouseEngine(container, cbRef) {
  const V3 = THREE.Vector3;
  const disposables = [];
  const keep = (o) => {
    disposables.push(o);
    return o;
  };
  const themeHooks = [];
  const themed = (mat, key, prop = 'color') => {
    themeHooks.push((p) => mat[prop].set(p[key]));
    return mat;
  };
  let pal = PALETTES.dark;

  /* ---------- renderer / scene / camera ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none;touch-action:none;cursor:grab;';
  container.appendChild(canvas);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const makeTex = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, maxAniso);
    return t;
  };
  const tex = (c) => keep(makeTex(c));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  scene.fog = new THREE.Fog(0x000000, 95, 200);
  themeHooks.push((p) => {
    scene.background.set(p.background);
    scene.fog.color.set(p.background);
    scene.fog.near = p.fogNear;
    scene.fog.far = p.fogFar;
  });

  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3.5;
  controls.maxDistance = 150;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.screenSpacePanning = true;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.9;
  controls.autoRotateSpeed = 0.55;

  /* ---------- lights ---------- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(-16, 34, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 30, bottom: -30, near: 1, far: 110 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x9ec5ff, 0.35);
  fill.position.set(22, 16, -20);
  scene.add(fill);
  themeHooks.push((p) => {
    hemi.color.set(p.hemiSky);
    hemi.groundColor.set(p.hemiGround);
    hemi.intensity = p.hemiIntensity;
    sun.intensity = p.sunIntensity;
  });

  /* ---------- helpers ---------- */
  const m4 = new THREE.Matrix4();
  const tmpColor = new THREE.Color();
  const std = (opts = {}) => keep(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, ...opts }));
  const basic = (opts = {}) => keep(new THREE.MeshBasicMaterial({ toneMapped: false, ...opts }));
  const lineMat = (opts = {}) => keep(new THREE.LineBasicMaterial({ toneMapped: false, ...opts }));
  const boxGeo = (w, h, d) => keep(new THREE.BoxGeometry(w, h, d));
  const flatGeo = (w, d) => keep(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2));
  const addFlat = (w, d, mat, x, y, z) => {
    const m = new THREE.Mesh(flatGeo(w, d), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const addLines = (pts, mat) => {
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(g, mat);
    scene.add(l);
    return l;
  };
  const floorText = (text, height, colorKey, x, y, z, { weight = 700, opacity = 1 } = {}) => {
    const c = labelCanvas([{ text, size: 96, weight }], { padX: 6, padY: 2 });
    const mat = themed(basic({ map: tex(c), transparent: true, depthWrite: false, opacity }), colorKey);
    const mesh = new THREE.Mesh(flatGeo((height * c.width) / c.height, height), mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  };
  /** `fixed` sprites keep a constant on-screen size (height = fraction of the view
   *  frustum at 1 unit), so labels stay legible far away and never balloon up close. */
  const makeSprite = (lines, height, opts = {}, { depthTest = true, fixed = false } = {}) => {
    const c = labelCanvas(lines, opts);
    const mat = new THREE.SpriteMaterial({ map: makeTex(c), transparent: true, depthWrite: false, depthTest, toneMapped: false, sizeAttenuation: !fixed });
    const s = new THREE.Sprite(mat);
    s.scale.set((height * c.width) / c.height, height, 1);
    s.userData.h = height;
    return s;
  };
  const resprite = (s, lines, opts = {}) => {
    const c = labelCanvas(lines, opts);
    s.material.map?.dispose();
    s.material.map = makeTex(c);
    s.material.needsUpdate = true;
    s.scale.set((s.userData.h * c.width) / c.height, s.userData.h, 1);
  };
  const instanced = (geo, mat, positions, { cast = false, receive = true, rotY = null } = {}) => {
    const mesh = new THREE.InstancedMesh(geo, mat, positions.length);
    positions.forEach((p, i) => {
      if (rotY) m4.makeRotationY(rotY[i]).setPosition(p[0], p[1], p[2]);
      else m4.makeTranslation(p[0], p[1], p[2]);
      mesh.setMatrixAt(i, m4);
    });
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    return mesh;
  };

  /* ---------- ground, yard road, building floor ---------- */
  addFlat(240, 180, themed(std({ roughness: 1 }), 'yard'), 0, 0, 0);
  addFlat(130, DIM.aisleHalf * 2 + 1.4, themed(std({ roughness: 0.95 }), 'road'), 0, 0.01, 0);
  const roadDashes = [];
  for (let x = DIM.bx + 2; x < 64; x += 3.4) roadDashes.push([x, 0.016, 0], [-x, 0.016, 0]);
  instanced(flatGeo(1.7, 0.14), themed(basic({}), 'roadMark'), roadDashes);
  addFlat(DIM.bx * 2, DIM.bz * 2, themed(std({ roughness: 0.9 }), 'floor'), 0, 0.02, 0);
  {
    const pts = [];
    for (let x = -DIM.bx; x <= DIM.bx + 1e-6; x += DIM.bx / 10) pts.push(x, 0.026, -DIM.bz, x, 0.026, DIM.bz);
    for (let z = -DIM.bz; z <= DIM.bz + 1e-6; z += DIM.bz / 10) pts.push(-DIM.bx, 0.026, z, DIM.bx, 0.026, z);
    addLines(pts, themed(lineMat({ transparent: true, opacity: 0.9 }), 'grid'));
  }

  /* ---------- main drive aisle + markings ---------- */
  addFlat(DIM.bx * 2, DIM.aisleHalf * 2, themed(std({ roughness: 0.95 }), 'aisle'), 0, 0.03, 0);
  const edgeMat = themed(basic({}), 'edgeLine');
  addFlat(DIM.bx * 2, 0.14, edgeMat, 0, 0.04, DIM.aisleHalf - 0.12);
  addFlat(DIM.bx * 2, 0.14, edgeMat, 0, 0.04, -(DIM.aisleHalf - 0.12));
  const dashes = [];
  for (let x = -DIM.bx + 1.2; x <= DIM.bx - 1.2; x += 2) if (Math.abs(x) > 5.4) dashes.push([x, 0.04, 0]);
  const centerMat = themed(basic({}), 'centerLine');
  instanced(flatGeo(1.1, 0.1), centerMat, dashes);
  {
    const s = new THREE.Shape();
    s.moveTo(-0.65, 0.17);
    s.lineTo(0.15, 0.17);
    s.lineTo(0.15, 0.42);
    s.lineTo(0.68, 0);
    s.lineTo(0.15, -0.42);
    s.lineTo(0.15, -0.17);
    s.lineTo(-0.65, -0.17);
    s.closePath();
    const arrowGeo = keep(new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2));
    const arrowMat = themed(basic({ transparent: true, opacity: 0.55 }), 'centerLine');
    const pos = [];
    const rot = [];
    for (const x of [-7.5, -2.5, 2.5, 7.5]) {
      pos.push([x, 0.045, 1.65]);
      rot.push(0); // south lane flows east (entry → exit)
      pos.push([x, 0.045, -1.65]);
      rot.push(Math.PI); // north lane returns west
    }
    instanced(arrowGeo, arrowMat, pos, { rotY: rot });
  }
  floorText('MAIN DRIVE AISLE', 0.5, 'label', 0, 0.05, 0, { weight: 800 });

  /* ---------- lanes, labels, racks ---------- */
  const laneDepth = ROWS * DIM.rowPitch;
  const laneStrips = [];
  const stopLines = [];
  LANE_INFO.forEach(({ lane, block, x }) => {
    laneStrips.push([x, 0.032, block.dir * (DIM.laneMouth + laneDepth / 2)]);
    stopLines.push([x, 0.04, block.dir * (DIM.laneMouth - 0.1)]);
    floorText(`L-${lane}`, 0.6, 'labelStrong', x, 0.05, block.dir * (DIM.aisleHalf - 0.78), { weight: 800 });
  });
  instanced(flatGeo(1.76, laneDepth), themed(std({ roughness: 0.95 }), 'laneFloor'), laneStrips);
  instanced(flatGeo(1.76, 0.1), themed(basic({}), 'stopLine'), stopLines);
  BLOCKS.forEach((block) => {
    const firstX = LANE_INFO.get(block.lanes[0]).x;
    for (let r = 1; r <= ROWS; r++) floorText(`R${r}`, 0.36, 'label', firstX - 1.65, 0.05, block.dir * (DIM.laneMouth + (r - 0.5) * DIM.rowPitch));
    floorText(
      `${block.name.toUpperCase()}  ·  L-${block.lanes[0]} – L-${block.lanes[block.lanes.length - 1]}`,
      0.48,
      'label',
      0,
      0.05,
      block.dir * (DIM.laneMouth + laneDepth + 0.5),
      { weight: 800 }
    );
    SHELVES.forEach((shelf, level) => {
      const s = makeSprite([{ text: shelf, size: 64, weight: 800, color: '#e2e8f0' }], 0.4, { bg: 'rgba(15,23,42,0.82)', radius: 14, padX: 16, padY: 6 });
      s.position.set(firstX - 1.25, levelBaseY(level) + DIM.bale.h / 2, block.dir * (DIM.laneMouth + 0.15));
      scene.add(s);
    });
  });

  const rackX = 0.84;
  const uprightPos = [];
  const beamPos = [];
  LANE_INFO.forEach(({ x, block }) => {
    for (let r = 0; r <= ROWS; r++) for (const sx of [-rackX, rackX]) uprightPos.push([x + sx, RACK_H / 2, block.dir * (DIM.laneMouth + r * DIM.rowPitch)]);
    for (let l = 1; l <= SHELVES.length; l++) for (const sx of [-rackX, rackX]) beamPos.push([x + sx, levelBaseY(l) - 0.075, block.dir * (DIM.laneMouth + laneDepth / 2)]);
  });
  const uprightMat = themed(std({ metalness: 0.5, roughness: 0.45 }), 'upright');
  const rackBeamMat = themed(std({ metalness: 0.35, roughness: 0.5 }), 'beam');
  instanced(boxGeo(0.08, RACK_H, 0.08), uprightMat, uprightPos, { cast: true });
  instanced(boxGeo(0.07, 0.09, laneDepth), rackBeamMat, beamPos, { cast: true });

  /* ---------- building shell ---------- */
  {
    const curbMat = themed(std({}), 'curb');
    const curbH = 0.32;
    const t = 0.25;
    const gap = DIM.aisleHalf + 0.45;
    const segLen = DIM.bz - gap;
    const parts = [
      [DIM.bx * 2 + t, 0, -DIM.bz],
      [DIM.bx * 2 + t, 0, DIM.bz],
    ];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push([t, segLen, sx * DIM.bx, sz * (gap + segLen / 2)]);
    parts.forEach((p) => {
      const geo = p.length === 3 ? boxGeo(p[0], curbH, t) : boxGeo(p[0], curbH, p[1]);
      const m = new THREE.Mesh(geo, curbMat);
      if (p.length === 3) m.position.set(0, curbH / 2, p[2]);
      else m.position.set(p[2], curbH / 2, p[3]);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    });
    const pillarPos = [];
    for (const x of [-DIM.bx, -DIM.bx / 2, 0, DIM.bx / 2, DIM.bx]) for (const z of [-DIM.bz, DIM.bz]) pillarPos.push([x, DIM.wallH / 2, z]);
    for (const x of [-DIM.bx, DIM.bx]) for (const z of [-8, 8]) pillarPos.push([x, DIM.wallH / 2, z]);
    instanced(boxGeo(0.34, DIM.wallH, 0.34), themed(std({ roughness: 0.6 }), 'pillar'), pillarPos, { cast: true });
    const y = DIM.wallH;
    const roof = [
      -DIM.bx, y, -DIM.bz, DIM.bx, y, -DIM.bz,
      DIM.bx, y, -DIM.bz, DIM.bx, y, DIM.bz,
      DIM.bx, y, DIM.bz, -DIM.bx, y, DIM.bz,
      -DIM.bx, y, DIM.bz, -DIM.bx, y, -DIM.bz,
    ];
    const wallLines = themed(lineMat({ transparent: true, opacity: 0.3 }), 'wallLine');
    themeHooks.push((p) => {
      wallLines.opacity = p.wallLineOpacity;
    });
    addLines(roof, wallLines);
  }

  /* ---------- gates & zones ---------- */
  const stripeTex = tex(stripeCanvas());
  stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
  const zoneMats = [];
  function buildGate(x, side, color, title, sub) {
    const mat = std({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.2 });
    const postGeo = boxGeo(0.38, 6.2, 0.38);
    for (const z of [-(DIM.aisleHalf + 0.3), DIM.aisleHalf + 0.3]) {
      const p = new THREE.Mesh(postGeo, mat);
      p.position.set(x, 3.1, z);
      p.castShadow = true;
      scene.add(p);
    }
    const header = new THREE.Mesh(boxGeo(0.42, 0.5, DIM.aisleHalf * 2 + 0.98), mat);
    header.position.set(x, 6.2, 0);
    header.castShadow = true;
    scene.add(header);
    const curtain = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(DIM.aisleHalf * 2 + 0.2, 5.9)),
      basic({ color, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    curtain.rotation.y = Math.PI / 2;
    curtain.position.set(x, 2.95, 0);
    scene.add(curtain);
    const zoneTex = stripeTex.clone();
    keep(zoneTex);
    zoneTex.repeat.set(4.2 / 1.1, 14 / 1.1);
    zoneTex.needsUpdate = true;
    const zoneMat = basic({ map: zoneTex, color, transparent: true, opacity: 0.3, depthWrite: false });
    zoneMats.push(zoneMat);
    const cx = x - side * 2.2;
    addFlat(4.2, 14, zoneMat, cx, 0.036, 0);
    const zx0 = cx - 2.1;
    const zx1 = cx + 2.1;
    addLines([zx0, 0.05, -7, zx1, 0.05, -7, zx1, 0.05, -7, zx1, 0.05, 7, zx1, 0.05, 7, zx0, 0.05, 7, zx0, 0.05, 7, zx0, 0.05, -7], lineMat({ color }));
    const sign = makeSprite([{ text: title, size: 40, weight: 800 }], 0.022, { bg: color, radius: 12, padX: 16, padY: 6 }, { fixed: true });
    sign.userData.sub = sub;
    sign.position.set(x, 6.9, 0);
    scene.add(sign);
    const glow = new THREE.PointLight(color, 9, 13, 2);
    glow.position.set(x - side * 1.4, 3, 0);
    scene.add(glow);
    return curtain;
  }
  const entryCurtain = buildGate(-DIM.bx, -1, ENTRY_COLOR, 'ENTRY E-1', 'Inbound');
  const exitCurtain = buildGate(DIM.bx, 1, EXIT_COLOR, 'EXIT X-1', 'Outbound');
  themeHooks.push((p) => zoneMats.forEach((m) => (m.opacity = p.zoneOpacity)));
  floorText('RECEIVING BAY', 0.36, 'labelStrong', -DIM.bx + 2.15, 0.06, 6.82, { weight: 800 });
  floorText('FORKLIFT BAY', 0.36, 'labelStrong', -DIM.bx + 2.15, 0.06, -6.5, { weight: 800 });
  floorText('DISPATCH STAGING', 0.32, 'labelStrong', DIM.bx - 2.15, 0.06, 6.82, { weight: 800 });
  floorText('LOADING', 0.36, 'labelStrong', DIM.bx - 2.15, 0.06, -6.5, { weight: 800 });
  instanced(
    boxGeo(1.55, 0.1, 1.15),
    themed(std({}), 'deck'),
    [...IN_BAY.pads, ...OUT_BAY.pads].map((p) => [p.x, 0.07, p.z])
  );

  /* ---------- facilities in the four corners ---------- */
  const facilityMat = themed(std({ transparent: true, opacity: 0.9, roughness: 0.7 }), 'facility');
  themeHooks.push((p) => {
    facilityMat.opacity = p.facilityOpacity;
  });
  const facilityEdge = themed(lineMat({}), 'facilityEdge');
  [
    { name: 'QC LAB', x: -(DIM.bx - 2.2), z: -11.8 },
    { name: 'MAINTENANCE', x: DIM.bx - 2.2, z: -11.8 },
    { name: 'DISPATCH OFFICE', x: DIM.bx - 2.2, z: 11.8 },
  ].forEach((f) => {
    const geo = boxGeo(3.9, 2.5, 7.3);
    const m = new THREE.Mesh(geo, facilityMat);
    m.position.set(f.x, 1.25, f.z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    const e = new THREE.LineSegments(keep(new THREE.EdgesGeometry(geo)), facilityEdge);
    e.position.copy(m.position);
    scene.add(e);
    floorText(f.name, 0.4, 'labelStrong', f.x, 2.52, f.z, { weight: 800 }).rotation.y = Math.PI / 2;
  });
  addFlat(3.9, 7.3, themed(std({}), 'charge'), -(DIM.bx - 2.2), 0.034, 11.8);
  floorText('FORKLIFT CHARGING', 0.34, 'labelStrong', -(DIM.bx - 2.2), 0.05, 15.1, { weight: 800 });

  /* ---------- forklifts ---------- */
  const forkBody = std({ color: '#f59e0b', roughness: 0.5 });
  const forkDark = std({ color: '#1f2937', roughness: 0.6, metalness: 0.3 });
  const forkGeo = {
    body: boxGeo(1.45, 0.72, 1.0),
    post: boxGeo(0.06, 1.15, 0.06),
    roof: boxGeo(1.0, 0.06, 0.95),
    mast: boxGeo(0.1, 2.2, 0.85),
    mastInner: boxGeo(0.08, 2.2, 0.68),
    plate: boxGeo(0.08, 0.6, 0.9),
    fork: boxGeo(0.95, 0.05, 0.12),
    beacon: keep(new THREE.SphereGeometry(0.08, 12, 8)),
    wheel: keep(new THREE.CylinderGeometry(0.24, 0.24, 0.2, 16).rotateX(Math.PI / 2)),
  };
  const beaconMat = basic({ color: '#f59e0b' });
  /** Forklift model (forward = local +x). Working units (`rig`) are narrow-aisle turret
   *  trucks: the carriage rides a telescopic mast, swivels 90° and reaches into the rack,
   *  so they never need to turn around inside a 1.9 m access aisle. */
  function makeForklift(rig = false) {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, parent = g) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    add(forkGeo.body, forkBody, -0.1, 0.6, 0);
    for (const x of [-0.55, 0.35]) for (const z of [-0.42, 0.42]) add(forkGeo.post, forkDark, x, 1.5, z);
    add(forkGeo.roof, forkBody, -0.1, 2.08, 0);
    add(forkGeo.mast, forkDark, 0.72, 1.1, 0);
    for (const x of [-0.5, 0.45]) for (const z of [-0.52, 0.52]) add(forkGeo.wheel, forkDark, x, 0.24, z);
    if (!rig) {
      for (const z of [-0.25, 0.25]) add(forkGeo.fork, forkDark, 1.22, 0.16, z);
      scene.add(g);
      return { g };
    }
    const mastInner = add(forkGeo.mastInner, forkDark, 0.79, 1.1, 0);
    const beacon = add(forkGeo.beacon, beaconMat, -0.1, 2.17, 0);
    beacon.castShadow = false;
    const turret = new THREE.Group();
    turret.position.set(0.85, 0, 0);
    g.add(turret);
    add(forkGeo.plate, forkDark, 0.02, 0.32, 0, turret);
    const reach = new THREE.Group();
    turret.add(reach);
    for (const z of [-0.25, 0.25]) add(forkGeo.fork, forkDark, 0.5, 0.16, z, reach);
    scene.add(g);
    return { g, turret, reach, mastInner, beacon };
  }
  [9.3, 11.8, 14.3].forEach((z) => {
    const { g } = makeForklift();
    g.position.set(-(DIM.bx - 1.6), 0, z);
    g.rotation.y = Math.PI;
  });

  /* ---------- trucks ---------- */
  const baleTex = tex(baleCanvas());
  const baleGeo = keep(new RoundedBoxGeometry(DIM.bale.w, DIM.bale.h, DIM.bale.d, 3, 0.085));
  function makeTruck(pos, cabColor, which) {
    const g = new THREE.Group();
    const cab = std({ color: cabColor, roughness: 0.45, metalness: 0.2 });
    const dark = std({ color: '#1f2937', roughness: 0.7 });
    const glass = std({ color: '#0f172a', roughness: 0.15, metalness: 0.6 });
    const bed = std({ color: '#94a3b8', roughness: 0.6, metalness: 0.3 });
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.truck = which;
      g.add(m);
      return m;
    };
    add(boxGeo(1.9, 2.0, 2.3), cab, 3.55, 1.5, 0);
    add(boxGeo(0.05, 0.8, 2.0), glass, 4.52, 1.95, 0);
    add(boxGeo(8.4, 0.3, 1.9), dark, 0, 0.62, 0);
    add(boxGeo(6.3, 0.16, 2.45), bed, -0.95, 0.85, 0);
    for (const z of [-1.2, 1.2]) add(boxGeo(6.3, 0.35, 0.06), bed, -0.95, 1.1, z);
    const wheelGeo = keep(new THREE.CylinderGeometry(0.46, 0.46, 0.38, 20).rotateX(Math.PI / 2));
    for (const x of [3.3, -2.1, -3.3]) for (const z of [-1.05, 1.05]) add(wheelGeo, dark, x, 0.46, z);
    const loadMat = std({ map: baleTex, roughness: 0.92 });
    const load = new THREE.InstancedMesh(baleGeo, loadMat, LOAD_SPOTS.length);
    LOAD_SPOTS.forEach((p, i) => {
      m4.makeTranslation(p.x, p.y, p.z);
      load.setMatrixAt(i, m4);
    });
    load.castShadow = true;
    load.userData.truck = which;
    load.count = 0;
    g.add(load);
    g.position.copy(pos);
    scene.add(g);
    const label = makeSprite([{ text: '…', size: 36 }], 0.02, {}, { fixed: true });
    label.position.set(pos.x + 3.55, 4.3, pos.z);
    scene.add(label);
    return { group: g, load, label, count: -1 };
  }
  const inbound = makeTruck(INBOUND_TRUCK, '#d97706', 'inbound');
  const outbound = makeTruck(OUTBOUND_TRUCK, '#475569', 'outbound');

  /* ---------- slot instancing (filled bales, empty slots, shelf decks) ---------- */
  const baleMat = std({ map: baleTex, roughness: 0.92 });
  const filledMesh = new THREE.InstancedMesh(baleGeo, baleMat, CAPACITY);
  filledMesh.castShadow = true;
  filledMesh.receiveShadow = true;
  for (let i = 0; i < CAPACITY; i++) filledMesh.setColorAt(i, tmpColor.set('#ffffff'));
  filledMesh.count = 0;
  scene.add(filledMesh);

  const emptyMat = themed(basic({ transparent: true, opacity: 0.05, depthWrite: false }), 'emptyFill');
  const emptyMesh = new THREE.InstancedMesh(boxGeo(DIM.bale.w, DIM.bale.h, DIM.bale.d), emptyMat, CAPACITY);
  emptyMesh.count = 0;
  scene.add(emptyMesh);

  const deckMat = themed(std({ roughness: 0.8 }), 'deck');
  const deckMesh = new THREE.InstancedMesh(boxGeo(1.6, 0.05, 1.12), deckMat, CAPACITY);
  deckMesh.receiveShadow = true;
  deckMesh.count = 0;
  scene.add(deckMesh);

  const edgeTemplate = (() => {
    const b = new THREE.BoxGeometry(DIM.bale.w, DIM.bale.h, DIM.bale.d);
    const e = new THREE.EdgesGeometry(b);
    const arr = Float32Array.from(e.attributes.position.array);
    b.dispose();
    e.dispose();
    return arr;
  })();
  const VPE = edgeTemplate.length; // floats per empty-slot outline
  const emptyEdgeGeo = keep(new THREE.BufferGeometry());
  const emptyEdgeAttr = new THREE.BufferAttribute(new Float32Array(CAPACITY * VPE), 3).setUsage(THREE.DynamicDrawUsage);
  emptyEdgeGeo.setAttribute('position', emptyEdgeAttr);
  const emptyEdgeMat = themed(lineMat({ transparent: true, opacity: 0.7 }), 'emptyEdge');
  themeHooks.push((p) => {
    emptyEdgeMat.opacity = p.emptyEdgeOpacity;
    emptyMat.opacity = p.emptyFillOpacity;
  });
  const emptyEdges = new THREE.LineSegments(emptyEdgeGeo, emptyEdgeMat);
  emptyEdges.frustumCulled = false;
  scene.add(emptyEdges);

  const recMesh = new THREE.InstancedMesh(baleGeo, std({ map: baleTex, roughness: 0.92 }), RECEIVING_SPOTS.length);
  RECEIVING_SPOTS.forEach((p, i) => {
    m4.makeTranslation(p.x, p.y, p.z);
    recMesh.setMatrixAt(i, m4);
    recMesh.setColorAt(i, tmpColor.set('#9fdcc4'));
  });
  recMesh.castShadow = true;
  recMesh.count = 0;
  scene.add(recMesh);
  // Bales a forklift has set down in dispatch staging, waiting for the dock loader.
  const stageMesh = new THREE.InstancedMesh(baleGeo, std({ map: baleTex, roughness: 0.92 }), OUT_BAY.pads.length);
  OUT_BAY.pads.forEach((p, i) => stageMesh.setColorAt(i, tmpColor.set('#d6d3cb')));
  stageMesh.castShadow = true;
  stageMesh.count = 0;
  scene.add(stageMesh);

  [filledMesh, emptyMesh, deckMesh, recMesh, stageMesh].forEach((m) => {
    m.frustumCulled = false;
  });

  /* ---------- selection marker, hover box, journey path ---------- */
  const selGroup = new THREE.Group();
  selGroup.visible = false;
  scene.add(selGroup);
  const selBoxGeo = boxGeo(DIM.bale.w + 0.16, DIM.bale.h + 0.16, DIM.bale.d + 0.16);
  const selBox = new THREE.Mesh(selBoxGeo, basic({ color: ACCENT, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
  const selEdges = new THREE.LineSegments(keep(new THREE.EdgesGeometry(selBoxGeo)), lineMat({ color: ACCENT, transparent: true, depthTest: false }));
  selEdges.renderOrder = 10;
  selGroup.add(selBox, selEdges);

  const pin = new THREE.Group();
  const pinMat = std({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.1 });
  const cone = new THREE.Mesh(keep(new THREE.ConeGeometry(0.34, 0.95, 28)), pinMat);
  cone.rotation.x = Math.PI;
  cone.position.y = 0.475;
  const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.42, 28, 18)), pinMat);
  head.position.y = 1.1;
  const halo = new THREE.Mesh(keep(new THREE.TorusGeometry(0.64, 0.045, 10, 56)), basic({ color: ACCENT, transparent: true, opacity: 0.85 }));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 1.1;
  pin.add(cone, head, halo);
  selGroup.add(pin);
  const beamGradient = tex(gradientCanvas());
  const beam = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.06, 0.06, 1, 12, 1, true)),
    basic({ color: ACCENT, map: beamGradient, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  );
  const beamGlow = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.34, 0.34, 1, 20, 1, true)),
    basic({ color: ACCENT, map: beamGradient, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  );
  selGroup.add(beam, beamGlow);
  const ring = new THREE.Mesh(
    keep(new THREE.RingGeometry(0.72, 0.86, 56).rotateX(-Math.PI / 2)),
    basic({ color: ACCENT, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })
  );
  selGroup.add(ring);
  const selLabel = makeSprite([{ text: '—', size: 36 }], 0.024, {}, { depthTest: false, fixed: true });
  selLabel.renderOrder = 12;
  selGroup.add(selLabel);
  let pinBaseY = 5;
  let selLabelKey = '';

  const hoverEdges = new THREE.LineSegments(
    keep(new THREE.EdgesGeometry(boxGeo(DIM.bale.w + 0.1, DIM.bale.h + 0.1, DIM.bale.d + 0.1))),
    themed(lineMat({ transparent: true, opacity: 0.95, depthTest: false }), 'hover')
  );
  hoverEdges.renderOrder = 11;
  hoverEdges.visible = false;
  scene.add(hoverEdges);

  const flowTex = tex(flowCanvas());
  flowTex.wrapS = flowTex.wrapT = THREE.RepeatWrapping;
  const pathMat = basic({ map: flowTex, color: ACCENT, transparent: true, opacity: 0.95, depthWrite: false });
  let pathMesh = null;

  const pulseGeo = boxGeo(DIM.bale.w + 0.2, DIM.bale.h + 0.2, DIM.bale.d + 0.2);
  const pulses = [];

  /* ---------- safety infrastructure: exits, hydrants, traps, HV cage, detectors ---------- */
  const glowTex = tex(glowCanvas());
  const exitMat = std({ color: '#16a34a', emissive: '#16a34a', emissiveIntensity: 0.55, roughness: 0.4 });
  const exitDoorGeo = keep(new THREE.PlaneGeometry(1.4, 2.4));
  const exitDoorMat = basic({ color: '#22c55e', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  EXITS.forEach((e) => {
    for (const dx of [-0.78, 0.78]) {
      const p = new THREE.Mesh(boxGeo(0.16, 2.5, 0.34), exitMat);
      p.position.set(e.x + dx, 1.25, e.z);
      scene.add(p);
    }
    const head = new THREE.Mesh(boxGeo(1.72, 0.2, 0.34), exitMat);
    head.position.set(e.x, 2.55, e.z);
    const door = new THREE.Mesh(exitDoorGeo, exitDoorMat);
    door.position.set(e.x, 1.2, e.z);
    scene.add(head, door);
  });
  const hydrantMat = std({ color: '#dc2626', roughness: 0.4, metalness: 0.25 });
  const hydrantGeo = {
    body: keep(new THREE.CylinderGeometry(0.15, 0.19, 0.9, 16)),
    cap: keep(new THREE.SphereGeometry(0.17, 14, 10)),
    arm: keep(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 10).rotateZ(Math.PI / 2)),
  };
  HYDRANTS.forEach((h) => {
    const g = new THREE.Group();
    const parts = [
      [hydrantGeo.body, 0.45],
      [hydrantGeo.cap, 0.92],
      [hydrantGeo.arm, 0.62],
    ];
    parts.forEach(([geo, y]) => {
      const m = new THREE.Mesh(geo, hydrantMat);
      m.position.y = y;
      m.castShadow = true;
      g.add(m);
    });
    g.position.set(h.x, 0, h.z);
    scene.add(g);
  });

  const trapBody = new THREE.InstancedMesh(boxGeo(0.34, 0.16, 0.5), std({ color: '#334155', roughness: 0.6 }), TRAPS.length);
  const trapLed = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.075, 12, 8)), basic({}), TRAPS.length);
  TRAPS.forEach((t, i) => {
    m4.makeTranslation(t.x, 0.11, t.z);
    trapBody.setMatrixAt(i, m4);
    m4.makeTranslation(t.x, 0.24, t.z);
    trapLed.setMatrixAt(i, m4);
    trapLed.setColorAt(i, tmpColor.set('#22c55e'));
  });
  trapBody.computeBoundingSphere();
  trapLed.computeBoundingSphere();
  scene.add(trapBody, trapLed);
  const TRAP_LED = { ARMED: '#22c55e', TRIGGERED: '#facc15', ACTIVITY: '#fde047', LOW_BATTERY: '#94a3b8' };
  let trapState = TRAPS.map(() => 'ARMED');

  const [hx0, hz0, hx1, hz1] = HV_RECT;
  addFlat(hx1 - hx0, hz1 - hz0, basic({ color: '#8b5cf6', transparent: true, opacity: 0.08, depthWrite: false }), (hx0 + hx1) / 2, 0.036, (hz0 + hz1) / 2);
  instanced(
    boxGeo(0.12, 3.0, 0.12),
    std({ color: '#6d28d9', roughness: 0.5 }),
    [[hx0, 1.5, hz0], [hx1, 1.5, hz0], [hx0, 1.5, hz1], [hx1, 1.5, hz1]],
    { cast: true }
  );
  const beamMats = {};
  Object.entries(BEAM_GEOM).forEach(([id, g]) => {
    const pts = [];
    for (const y of [0.35, 0.95, 1.55, 2.15, 2.75]) pts.push(g.a[0], y, g.a[1], g.b[0], y, g.b[1]);
    beamMats[id] = lineMat({ color: '#ff2d55', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    addLines(pts, beamMats[id]);
  });
  let beamState = {};
  const lotSigns = [];
  {
    const hv = makeSprite([{ text: `HV-1 · ${HV_LOT.tag}`, size: 32, weight: 700 }], 0.019, { bg: 'rgba(91,33,182,0.9)', radius: 12, padX: 14, padY: 6 }, { fixed: true });
    hv.position.set((hx0 + hx1) / 2, RACK_H + 0.6, BEAM_GEOM['B-1'].a[1]);
    scene.add(hv);
    lotSigns.push(hv);
    SPECIAL_LOTS.filter((l) => !l.caged).forEach((l) => {
      const r = laneRect(l.lanes, l.rows);
      const s = makeSprite([{ text: `${l.id} · ${l.tag}`, size: 32, weight: 700 }], 0.019, { bg: 'rgba(15,23,42,0.82)', radius: 12, padX: 14, padY: 6 }, { fixed: true });
      s.position.set((r[0] + r[2]) / 2, RACK_H + 0.55, (r[1] + r[3]) / 2);
      scene.add(s);
      lotSigns.push(s);
    });
  }

  const zoneBeamMats = {};
  ZONES.filter((z) => z.lanes).forEach((z) => {
    const y = RACK_H + 0.75;
    const [x0, z0, x1, z1] = z.rect;
    const rowsZ = [z0 + (z1 - z0) * 0.3, z0 + (z1 - z0) * 0.7];
    zoneBeamMats[z.id] = lineMat({ color: '#64748b', transparent: true, opacity: 0.4, depthWrite: false });
    addLines(rowsZ.flatMap((zz) => [x0, y, zz, x1, y, zz]), zoneBeamMats[z.id]);
    instanced(boxGeo(0.22, 0.22, 0.22), std({ color: '#475569' }), rowsZ.flatMap((zz) => [[x0, y, zz], [x1, y, zz]]));
  });
  let zoneState = {};
  const mistSystems = new Map();
  function setMist(zoneId, on) {
    let p = mistSystems.get(zoneId);
    if (on && !p) {
      const [x0, z0, x1, z1] = ZONE_BY_ID.get(zoneId).rect;
      const N = 420;
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = x0 + Math.random() * (x1 - x0);
        pos[i * 3 + 1] = Math.random() * (RACK_H + 0.6);
        pos[i * 3 + 2] = z0 + Math.random() * (z1 - z0);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      p = new THREE.Points(g, new THREE.PointsMaterial({ color: '#bfe3ff', size: 0.12, transparent: true, opacity: 0.75, depthWrite: false }));
      p.userData.top = RACK_H + 0.6;
      scene.add(p);
      mistSystems.set(zoneId, p);
    } else if (!on && p) {
      scene.remove(p);
      p.geometry.dispose();
      p.material.dispose();
      mistSystems.delete(zoneId);
    }
  }

  /* ---------- dynamic hazard overlays: glowing auras + floating risk markers ---------- */
  const overlayRoot = new THREE.Group();
  const markerRoot = new THREE.Group();
  scene.add(overlayRoot, markerRoot);
  const unitBox = boxGeo(1, 1, 1);
  const trapRingGeo = keep(new THREE.RingGeometry(0.42, 0.62, 40).rotateX(-Math.PI / 2));
  const clutter = { pallet: boxGeo(0.85, 0.14, 1.1), carton: boxGeo(0.45, 0.4, 0.45), palletMat: std({ color: '#8b5a2b', roughness: 0.9 }), cartonMat: std({ color: '#c8a26b', roughness: 0.85 }) };
  const hatchTex = tex(stripeCanvas());
  hatchTex.wrapS = hatchTex.wrapT = THREE.RepeatWrapping;
  hatchTex.repeat.set(1, 4);
  let overlayItems = [];
  const markerCache = new Map();
  let hazards = null;
  let overlaysOn = true;
  let viewMode = 'normal';
  let heatField = 'thermal';
  let selectedIncidentId = null;
  let tiltKey = '';

  const auraMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  function clearOverlays() {
    for (const it of overlayItems) {
      it.objects.forEach((o) => overlayRoot.remove(o));
      it.trash.forEach((d) => d.dispose());
    }
    overlayItems = [];
  }
  function upsertMarker(inc, x, y, z) {
    const sel = inc.id === selectedIncidentId;
    const text = sel ? markerText(inc) : '';
    const key = `${text}|${sel}|${inc.severity}|${inc.category}`;
    let m = markerCache.get(inc.id);
    if (!m) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false, sizeAttenuation: false }));
      sprite.renderOrder = 15;
      sprite.userData.incidentId = inc.id;
      markerRoot.add(sprite);
      m = { sprite, key: '', w: 1, h: 1 };
      markerCache.set(inc.id, m);
    }
    if (m.key !== key) {
      // Only the selected incident expands into a labelled pill; the rest stay compact badges.
      const c = sel ? markerCanvas(inc, text, true) : badgeCanvas(inc);
      m.sprite.material.map?.dispose();
      m.sprite.material.map = makeTex(c);
      m.sprite.material.needsUpdate = true;
      m.h = sel ? 0.036 : 0.024;
      m.w = (m.h * c.width) / c.height;
      m.key = key;
    }
    m.sprite.position.set(x, y, z);
    m.sprite.scale.set(m.w, m.h, 1);
    return m;
  }
  function buildOverlays() {
    clearOverlays();
    const seen = new Set();
    if (hazards && overlaysOn) {
      const stack = new Map();
      for (const inc of hazards.incidents) {
        if (!hazards.cats.has(inc.category)) continue;
        const a = incidentAnchor(inc);
        if (!a) continue;
        const color = HAZARD_CATS[inc.category].aura;
        const it = { inc, objects: [], trash: [], pulse: [], speed: inc.severity === 'CRITICAL' ? 4.2 : inc.severity === 'WARNING' ? 2.6 : 1.4, phase: hash01(inc.id) * 6.28 };
        const add = (o, ...trash) => {
          overlayRoot.add(o);
          it.objects.push(o);
          it.trash.push(...trash);
          return o;
        };
        const auraBox = (sx, sy, sz, x, y, z, lo, hi) => {
          const m = auraMat(color, lo);
          const b = add(new THREE.Mesh(unitBox, m), m);
          b.scale.set(sx, sy, sz);
          b.position.set(x, y, z);
          it.pulse.push([m, lo, hi]);
        };
        const glow = (size, x, y, z) => {
          const m = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
          const s = add(new THREE.Sprite(m), m);
          s.scale.set(size, size, 1);
          s.position.set(x, y, z);
          it.pulse.push([m, 0.3, 0.95]);
        };
        if (a.kind === 'slot') {
          auraBox(DIM.bale.w + 0.4, DIM.bale.h + 0.4, DIM.bale.d + 0.4, a.x, a.y, a.z, 0.12, 0.4);
          glow(3.6, a.x, a.y, a.z);
        } else if (a.kind === 'column') {
          auraBox(1.95, RACK_H + 0.3, 1.5, a.x, RACK_H / 2, a.z, 0.08, 0.26);
          glow(5.5, a.x, RACK_H * 0.55, a.z);
        } else if (a.kind === 'aisle') {
          const g = new THREE.PlaneGeometry(0.9, a.len).rotateX(-Math.PI / 2);
          const m = new THREE.MeshBasicMaterial({ map: hatchTex, color, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
          const f = add(new THREE.Mesh(g, m), g, m);
          f.position.set(a.x, 0.07, a.z);
          it.pulse.push([m, 0.3, 0.8]);
          [
            [clutter.pallet, clutter.palletMat, 0, 0.07, -0.7],
            [clutter.pallet, clutter.palletMat, 0.02, 0.21, -0.68],
            [clutter.pallet, clutter.palletMat, -0.03, 0.35, -0.72],
            [clutter.carton, clutter.cartonMat, -0.12, 0.2, 0.35],
            [clutter.carton, clutter.cartonMat, 0.14, 0.2, 0.75],
            [clutter.carton, clutter.cartonMat, 0.0, 0.6, 0.5],
          ].forEach(([geo, mat, dx, y, dz]) => {
            const c = add(new THREE.Mesh(geo, mat));
            c.position.set(a.x + dx, y, a.z + dz);
            c.rotation.y = dx * 3;
            c.castShadow = true;
          });
          glow(3.2, a.x, 0.6, a.z);
        } else if (a.kind === 'trap') {
          const m = auraMat(color, 0.6);
          const r = add(new THREE.Mesh(trapRingGeo, m), m);
          r.position.set(a.x, 0.06, a.z);
          it.pulse.push([m, 0.25, 0.9]);
          glow(2.2, a.x, 0.3, a.z);
        } else if (a.kind === 'zone') {
          const [x0, z0, x1, z1] = a.rect;
          const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
          const m = auraMat(color, 0.08);
          const f = add(new THREE.Mesh(g, m), g, m);
          f.position.set((x0 + x1) / 2, 0.06, (z0 + z1) / 2);
          it.pulse.push([m, 0.04, 0.16]);
        } else if (a.kind === 'beam') {
          const b = BEAM_GEOM[a.beam];
          auraBox(Math.abs(b.b[0] - b.a[0]) + 0.3, 3.0, Math.abs(b.b[1] - b.a[1]) + 0.3, b.cx, 1.5, b.cz, 0.06, 0.22);
          glow(4.5, b.cx, 1.5, b.cz);
        } else if (a.kind === 'dock') {
          auraBox(3.2, 3.2, 7, a.x, 1.6, a.z, 0.06, 0.2);
          glow(6, a.x, 1.6, a.z);
        } else {
          auraBox(2.2, 2.8, 1.6, a.x, 1.4, a.z, 0.08, 0.24);
        }
        const key = `${Math.round(a.x)}:${Math.round(a.z)}`;
        const n = stack.get(key) ?? 0;
        stack.set(key, n + 1);
        let mx = a.x;
        if (selection?.slot && SLOT_STATUSES.has(selection.status)) {
          const s = SLOT_BY_KEY.get(selection.slot);
          if (s && Math.abs(s.x - a.x) < 1 && Math.abs(s.z - a.z) < 0.8) mx += 1.1;
        }
        const my = a.top + 1.1 + n * 0.85;
        const lg = new THREE.BufferGeometry().setFromPoints([new V3(a.x, a.top + 0.05, a.z), new V3(mx, my - 0.2, a.z)]);
        const lm = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false });
        add(new THREE.Line(lg, lm), lg, lm);
        it.marker = upsertMarker(inc, mx, my, a.z);
        it.baseY = my;
        it.critical = inc.severity === 'CRITICAL';
        seen.add(inc.id);
        overlayItems.push(it);
      }
    }
    for (const [id, m] of markerCache) {
      if (seen.has(id)) continue;
      markerRoot.remove(m.sprite);
      m.sprite.material.map?.dispose();
      m.sprite.material.dispose();
      markerCache.delete(id);
    }
  }

  /* ---------- hazard heat-map layer ---------- */
  const HEAT_W = 140;
  const HEAT_H = 128;
  const heatCanvas = document.createElement('canvas');
  heatCanvas.width = HEAT_W;
  heatCanvas.height = HEAT_H;
  const heatCtx = heatCanvas.getContext('2d');
  const heatImg = heatCtx.createImageData(HEAT_W, HEAT_H);
  const heatTex = tex(heatCanvas);
  const heatMesh = new THREE.Mesh(flatGeo(DIM.bx * 2, DIM.bz * 2), basic({ map: heatTex, transparent: true, depthWrite: false }));
  heatMesh.position.y = 0.1;
  heatMesh.renderOrder = 2;
  heatMesh.visible = false;
  scene.add(heatMesh);
  function renderHeat() {
    if (!hazards) return;
    const d = heatImg.data;
    const src = hazards.heat;
    for (let j = 0; j < HEAT_H; j++) {
      const z = -DIM.bz + ((j + 0.5) / HEAT_H) * DIM.bz * 2;
      for (let i = 0; i < HEAT_W; i++) {
        const x = -DIM.bx + ((i + 0.5) / HEAT_W) * DIM.bx * 2;
        let rgba;
        if (heatField === 'humidity') {
          let ws = 0;
          let vs = 0;
          for (const s of src.humidity) {
            const d2 = (x - s.x) ** 2 + (z - s.z) ** 2 + 0.5;
            const w = 1 / (d2 * d2);
            ws += w;
            vs += w * s.v;
          }
          rgba = rampHumidity(vs / ws);
        } else if (heatField === 'risk') {
          let v = 0;
          for (const s of src.risk) v += s.w * Math.exp(-((x - s.x) ** 2 + (z - s.z) ** 2) / 9);
          rgba = rampHeat(clamp(v, 0, 1));
        } else {
          let v = 22;
          for (const s of src.thermal) {
            const d2 = (x - s.x) ** 2 + (z - s.z) ** 2;
            if (d2 > 16) continue;
            const c = 22 + (s.v - 22) * Math.exp(-d2 / 3.2);
            if (c > v) v = c;
          }
          rgba = rampHeat(clamp((v - 24) / (62 - 24), 0, 1));
        }
        const o = (j * HEAT_W + i) * 4;
        d[o] = rgba[0];
        d[o + 1] = rgba[1];
        d[o + 2] = rgba[2];
        d[o + 3] = rgba[3];
      }
    }
    heatCtx.putImageData(heatImg, 0, 0);
    heatTex.needsUpdate = true;
  }
  const zoneLabelRoot = new THREE.Group();
  zoneLabelRoot.visible = false;
  scene.add(zoneLabelRoot);
  const zoneLabels = new Map();
  const zoneLabelStyle = { bg: 'rgba(15,23,42,0.86)', radius: 12, padX: 14, padY: 6, lineGap: 2 };
  function updateZoneLabels() {
    if (!hazards) return;
    for (const z of hazards.zones) {
      const sup = z.suppressionState === 'TRIGGERED' ? 'MIST DISCHARGING' : z.suppressionState === 'ACTIVE' ? 'Mist primed' : 'Standby';
      const supColor = z.suppressionState === 'TRIGGERED' ? '#fca5a5' : z.suppressionState === 'ACTIVE' ? '#fcd34d' : '#94a3b8';
      const lines = [
        { text: `${z.id} · ${Math.round(z.rh)} % RH`, size: 30, weight: 800 },
        { text: sup, size: 24, weight: 600, color: supColor },
      ];
      const text = lines.map((l) => l.text).join('|');
      let s = zoneLabels.get(z.id);
      if (!s) {
        s = makeSprite(lines, 0.026, zoneLabelStyle, { fixed: true });
        s.position.set(z.cx, z.lanes ? 0.4 : 0.3, z.cz);
        zoneLabelRoot.add(s);
        zoneLabels.set(z.id, s);
      } else if (s.userData.text !== text) resprite(s, lines, zoneLabelStyle);
      s.userData.text = text;
    }
  }

  /* ---------- emergency evacuation layer ---------- */
  const evacRoot = new THREE.Group();
  evacRoot.visible = false;
  scene.add(evacRoot);
  const evacTex = tex(flowCanvas());
  evacTex.wrapS = evacTex.wrapT = THREE.RepeatWrapping;
  evacTex.repeat.set(14, 1);
  const evacMat = basic({ map: evacTex, color: '#22c55e', transparent: true, depthWrite: false });
  const evacBlockedMat = basic({ color: '#ef4444', transparent: true, opacity: 0.9, depthWrite: false });
  ASSEMBLY_POINTS.forEach((ap) => {
    const ring = new THREE.Mesh(keep(new THREE.RingGeometry(1.9, 2.3, 56).rotateX(-Math.PI / 2)), basic({ color: '#22c55e', transparent: true, opacity: 0.9 }));
    ring.position.set(ap.x, 0.04, ap.z);
    const disc = new THREE.Mesh(keep(new THREE.CircleGeometry(1.9, 48).rotateX(-Math.PI / 2)), basic({ color: '#22c55e', transparent: true, opacity: 0.16, depthWrite: false }));
    disc.position.set(ap.x, 0.035, ap.z);
    const s = makeSprite([{ text: ap.name, size: 34, weight: 700 }], 0.022, { bg: 'rgba(21,128,61,0.92)', radius: 12, padX: 14, padY: 6 }, { fixed: true });
    s.position.set(ap.x, 1.4, ap.z);
    evacRoot.add(ring, disc, s);
  });
  EXITS.forEach((e) => {
    const s = makeSprite([{ text: e.id, size: 34, weight: 700 }], 0.019, { bg: 'rgba(22,163,74,0.94)', radius: 10, padX: 12, padY: 5 }, { fixed: true });
    s.position.set(e.x, 3.4, e.z);
    evacRoot.add(s);
  });
  HYDRANTS.forEach((h) => {
    const s = makeSprite([{ text: h.id, size: 30, weight: 700 }], 0.016, { bg: 'rgba(185,28,28,0.9)', radius: 10, padX: 10, padY: 4 }, { fixed: true });
    s.position.set(h.x, 1.7, h.z);
    evacRoot.add(s);
  });
  let evacTubes = [];
  const evacMarks = [];
  let evacKey = null;
  function rebuildEvac() {
    const blocked = hazards?.blockedLanes ?? [];
    const key = blocked.join(',');
    if (key === evacKey) return;
    evacKey = key;
    evacTubes.forEach((m) => {
      evacRoot.remove(m);
      m.geometry.dispose();
    });
    evacTubes = [];
    evacMarks.splice(0).forEach((s) => {
      evacRoot.remove(s);
      s.material.map?.dispose();
      s.material.dispose();
    });
    for (const r of EVAC_ROUTES) {
      const isBlocked = r.lane != null && blocked.includes(r.lane);
      const curve = roundedPolyline(r.points.map((p) => new V3(p[0], 0.2, p[1])), 0.9);
      if (!curve) continue;
      const geo = new THREE.TubeGeometry(curve, Math.max(24, Math.ceil(curve.getLength() * 4)), isBlocked ? 0.14 : 0.11, 8, false);
      const m = new THREE.Mesh(geo, isBlocked ? evacBlockedMat : evacMat);
      m.renderOrder = 6;
      evacRoot.add(m);
      evacTubes.push(m);
      if (isBlocked) {
        const L = LANE_INFO.get(r.lane);
        const alt = L.block.lanes[L.laneIdx > 0 ? L.laneIdx - 1 : L.laneIdx + 1];
        const s = makeSprite(
          [{ text: `Blocked · use L-${alt}`, size: 34, weight: 700 }],
          0.021,
          { bg: 'rgba(185,28,28,0.92)', radius: 12, padX: 14, padY: 6 },
          { fixed: true }
        );
        s.position.set(L.x + DIM.lanePitch / 2, 2.6, laneZ(r.lane, 4));
        evacRoot.add(s);
        evacMarks.push(s);
      }
    }
  }
  function applyViewMode() {
    const dim = viewMode === 'heatmap' ? 0.14 : viewMode === 'evac' ? 0.3 : 1;
    const faded = dim < 1;
    for (const m of [baleMat, uprightMat, rackBeamMat, deckMat]) {
      if (m.transparent !== faded) {
        m.transparent = faded;
        m.needsUpdate = true;
      }
      m.opacity = dim;
      m.depthWrite = !faded;
    }
    filledMesh.castShadow = !faded;
    emptyMesh.visible = !faded;
    emptyEdges.visible = !faded;
    deckMesh.visible = !faded;
    heatMesh.visible = viewMode === 'heatmap';
    zoneLabelRoot.visible = viewMode === 'heatmap';
    evacRoot.visible = viewMode === 'evac';
    lotSigns.forEach((s) => (s.visible = !faded));
    monitorRoot.visible = !faded;
    if (viewMode === 'heatmap') {
      renderHeat();
      updateZoneLabels();
    }
    if (viewMode === 'evac') rebuildEvac();
  }

  /* ---------- forklift fleet: animated put-away & dispatch jobs ----------
   * The data layer updates instantly; the 3D view lags it on purpose so a slot only
   * fills when the bale is set down and only empties when the bale is lifted out. */
  const hiddenSlots = new Map(); // slot → bale: stored in data, still on the forks
  const pendingPick = new Map(); // slot → bale: dispatched in data, still in the rack
  const occupantAt = (key) => {
    let id = data?.occupancy.get(key) ?? null;
    if (id && hiddenSlots.has(key)) id = null;
    if (!id && pendingPick.has(key)) id = pendingPick.get(key);
    return id;
  };
  const cargoMat = themed(std({ map: baleTex, roughness: 0.92 }), 'bale');
  const FL = { drive: 4.2, reverse: 2.6, turn: 4.5, lift: 2.0, turret: 2.6, reach: 1.4 };
  const LOAD_AFTER = 25; // s a bale stays parked in staging before the dock loader takes it
  const P = (x, z) => new V3(x, 0, z);
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const approach = (v, target, step) => (Math.abs(target - v) <= step ? target : v + Math.sign(target - v) * step);
  function makeTruckRig(home, phase) {
    const rig = makeForklift(true);
    const cargo = new THREE.Mesh(baleGeo, cargoMat);
    cargo.position.set(0.6, 0.2 + DIM.bale.h / 2, 0);
    cargo.castShadow = true;
    cargo.visible = false;
    rig.reach.add(cargo);
    return { ...rig, cargo, home, pos: home.clone(), heading: -Math.PI / 2, lift: 0.12, turretA: 0, reachX: 0, steps: [], job: null, phase, stagePad: null };
  }
  // Put-away / dispatch trucks park in the forklift bay (north half of the entry zone).
  const fleet = [0.9, 2.3, 3.7].map((dx, i) => makeTruckRig(P(-(DIM.bx - dx), -5.0), i * 1.7));
  // The dock loader lives in the loading area and carries staged bales onto the outbound truck.
  const loader = makeTruckRig(P(OUT_BAY.laneX, -5.0), 0.8);
  const allRigs = [...fleet, loader];
  const jobQueue = [];
  // Only one truck at a time works inside each bay lane.
  const laneLock = { in: null, out: null };

  // Receiving pads: bale per pad. A put-away bale keeps its pad until a forklift lifts it.
  const inPads = IN_BAY.pads.map(() => null);
  const padOf = new Map();
  const padMemo = new Map(); // bale → last pad, so a bale returns to the same pad after a data refresh
  const awaitingPick = new Set();
  const recIdx = []; // recMesh instance → pad
  function syncInPads() {
    if (!data) return;
    const want = [...awaitingPick, ...data.receivingIds];
    const wantSet = new Set(want);
    for (const [id, i] of padOf)
      if (!wantSet.has(id)) {
        padOf.delete(id);
        inPads[i] = null;
      }
    for (const id of want) {
      if (padOf.has(id)) continue;
      let i = padMemo.get(id);
      if (i == null || inPads[i] != null) i = inPads.indexOf(null);
      if (i < 0) continue; // bay full: extra bales wait off-screen
      inPads[i] = id;
      padOf.set(id, i);
      padMemo.set(id, i);
    }
    let n = 0;
    inPads.forEach((id, i) => {
      if (!id) return;
      const p = IN_BAY.pads[i];
      m4.makeTranslation(p.x, p.y, p.z);
      recMesh.setMatrixAt(n, m4);
      recIdx[n++] = i;
    });
    recMesh.count = n;
    recMesh.instanceMatrix.needsUpdate = true;
    recMesh.computeBoundingSphere();
  }

  // Dispatch staging pads: { id, t } per pad; reserved = a forklift is on its way to it.
  const outPads = OUT_BAY.pads.map(() => null);
  const outReserved = new Set();
  const stageIdx = [];
  function syncOutPads() {
    let n = 0;
    outPads.forEach((b, i) => {
      if (!b) return;
      const p = OUT_BAY.pads[i];
      m4.makeTranslation(p.x, p.y, p.z);
      stageMesh.setMatrixAt(n, m4);
      stageIdx[n++] = i;
    });
    stageMesh.count = n;
    stageMesh.instanceMatrix.needsUpdate = true;
    stageMesh.computeBoundingSphere();
  }
  const oldestStaged = () => outPads.reduce((best, b, i) => (b && (best < 0 || b.t < outPads[best].t) ? i : best), -1);

  function pulseAt(x, y, z, color) {
    const mesh = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    mesh.position.set(x, y, z);
    scene.add(mesh);
    pulses.push({ mesh, t0: clock.elapsedTime, dur: 1.8 });
  }
  function refreshSlots() {
    rebuildSlots();
    updateMonitors();
  }
  /** Where a turret truck stops beside a slot, and how far it must swivel, lift and reach. */
  function slotApproach(s) {
    const ax = s.x + DIM.lanePitch / 2; // centre line of the access aisle beside the lane
    const heading = (-s.dir * Math.PI) / 2; // facing deeper into the aisle
    return {
      ax,
      zl: s.dir * 1.6, // main-aisle travel lane on the slot's side
      stop: P(ax, s.z - s.dir * 0.85), // turret pivot sits level with the slot row
      heading,
      turret: wrapA(Math.PI - heading), // swivel so the forks point at the rack (−x)
      reach: DIM.lanePitch / 2 - 0.6, // bale centre lands on the slot centre
      liftY: levelBaseY(s.level) - 0.19, // fork top level with the shelf
    };
  }
  /** Same idea for a bay pad: drive down the bay lane facing +z, swing the forks to the pad's side. */
  function padApproach(bay, i) {
    const p = bay.pads[i];
    return {
      stop: P(bay.laneX, p.z - 0.85),
      turret: p.x > bay.laneX ? Math.PI / 2 : -Math.PI / 2, // heading +z: +π/2 points the forks at +x
      reach: Math.abs(p.x - bay.laneX) - 0.6,
      liftY: p.y - 0.2 - DIM.bale.h / 2, // fork top level with the pallet
    };
  }
  /** Pick a bale off a pad (or set one down): face, swing, reach, lift/lower, act, retract. */
  function padHandling(d, fn, picking) {
    return [
      { t: 'face', a: -Math.PI / 2 },
      { t: 'lift', y: picking ? d.liftY - 0.06 : d.liftY + 0.08 },
      { t: 'turret', a: d.turret },
      { t: 'reach', x: d.reach },
      { t: 'lift', y: picking ? d.liftY + 0.08 : d.liftY },
      { t: 'act', fn },
      { t: 'reach', x: 0 },
      { t: 'turret', a: 0 },
      { t: 'lift', y: 0.12 },
    ];
  }
  function putawaySteps(f, job) {
    const s = SLOT_BY_KEY.get(job.slot);
    const slotKey = job.slot;
    const a = slotApproach(s);
    const head = P(IN_BAY.laneX, 1.0);
    const take = () => {
      f.cargo.visible = true;
      awaitingPick.delete(job.baleId);
      padMemo.delete(job.baleId);
      syncInPads();
    };
    const pad = padOf.get(job.baleId);
    const pickup =
      pad != null
        ? [{ t: 'move', pts: [P(f.home.x, -2.0), head, padApproach(IN_BAY, pad).stop] }, ...padHandling(padApproach(IN_BAY, pad), take, true), { t: 'move', pts: [head], rev: true }]
        : [{ t: 'move', pts: [P(f.home.x, -2.0), head] }, { t: 'wait', d: 0.4 }, { t: 'act', fn: take }];
    return [
      { t: 'claim', lane: 'in' },
      ...pickup,
      { t: 'move', pts: [P(-DIM.bx + 4.6, a.zl)] },
      { t: 'release', lane: 'in' },
      { t: 'move', pts: [P(a.ax, a.zl), a.stop] },
      { t: 'face', a: a.heading },
      { t: 'lift', y: a.liftY + 0.1 },
      { t: 'turret', a: a.turret },
      { t: 'reach', x: a.reach },
      { t: 'lift', y: a.liftY },
      {
        t: 'act',
        fn: () => {
          f.cargo.visible = false;
          hiddenSlots.delete(slotKey);
          refreshSlots();
          pulseAt(s.x, s.y, s.z, '#4ade80');
        },
      },
      { t: 'reach', x: 0 },
      { t: 'turret', a: 0 },
      { t: 'lift', y: 0.12 },
      { t: 'move', pts: [P(a.ax, a.zl)], rev: true },
      { t: 'move', pts: [P(-DIM.bx + 4.6, a.zl), P(f.home.x, -2.0), f.home.clone()] },
      { t: 'face', a: -Math.PI / 2 },
    ];
  }
  /** Choose a staging pad once the lane is ours, then drive in and set the bale down on it. */
  function stagingDrop(f, job) {
    let i = outPads.findIndex((b, k) => !b && !outReserved.has(k));
    if (i < 0) {
      // Staging full (loader behind): the oldest parked bale is loaded straight away.
      i = oldestStaged();
      outPads[i] = null;
      syncOutPads();
    }
    outReserved.add(i);
    f.stagePad = i;
    const d = padApproach(OUT_BAY, i);
    const head = P(OUT_BAY.laneX, 1.0);
    const put = () => {
      f.cargo.visible = false;
      outReserved.delete(i);
      f.stagePad = null;
      outPads[i] = { id: job.baleId, t: clock.elapsedTime };
      syncOutPads();
    };
    return [{ t: 'move', pts: [head, d.stop] }, ...padHandling(d, put, false), { t: 'move', pts: [head], rev: true }];
  }
  /** Dock loader trip: oldest staged bale → out through Exit X-1 → onto the outbound truck bed. */
  function loadSteps() {
    const dockX = OUTBOUND_TRUCK.x - 5.4; // forks reach over the tail of the trailer bed
    return [
      { t: 'claim', lane: 'out' },
      {
        t: 'plan',
        fn: () => {
          const i = oldestStaged();
          if (i < 0) return [{ t: 'release', lane: 'out' }];
          const d = padApproach(OUT_BAY, i);
          const take = () => {
            loader.cargo.visible = true;
            outPads[i] = null;
            syncOutPads();
          };
          return [
            { t: 'move', pts: [d.stop] },
            ...padHandling(d, take, true),
            { t: 'move', pts: [P(OUT_BAY.laneX, OUTBOUND_TRUCK.z)], rev: true },
            { t: 'release', lane: 'out' },
            { t: 'face', a: 0 },
            { t: 'move', pts: [P(dockX, OUTBOUND_TRUCK.z)] },
            { t: 'lift', y: 0.86 },
            { t: 'reach', x: 0.7 },
            { t: 'lift', y: 0.74 },
            { t: 'act', fn: () => (loader.cargo.visible = false) },
            { t: 'reach', x: 0 },
            { t: 'lift', y: 0.12 },
            { t: 'move', pts: [P(OUT_BAY.laneX + 0.6, OUTBOUND_TRUCK.z)], rev: true },
            { t: 'move', pts: [P(OUT_BAY.laneX, -3.6), loader.home.clone()] },
            { t: 'face', a: -Math.PI / 2 },
          ];
        },
      },
    ];
  }
  function dispatchSteps(f, job) {
    const s = SLOT_BY_KEY.get(job.slot);
    const slotKey = job.slot;
    const a = slotApproach(s);
    return [
      { t: 'move', pts: [P(f.home.x, -2.0), P(-DIM.bx + 4.6, a.zl), P(a.ax, a.zl), a.stop] },
      { t: 'face', a: a.heading },
      { t: 'lift', y: a.liftY - 0.06 },
      { t: 'turret', a: a.turret },
      { t: 'reach', x: a.reach },
      { t: 'lift', y: a.liftY + 0.08 },
      {
        t: 'act',
        fn: () => {
          f.cargo.visible = true;
          pendingPick.delete(slotKey);
          refreshSlots();
        },
      },
      { t: 'reach', x: 0 },
      { t: 'turret', a: 0 },
      { t: 'lift', y: 0.12 },
      { t: 'move', pts: [P(a.ax, a.zl)], rev: true },
      { t: 'move', pts: [P(DIM.bx - 4.6, a.zl)] },
      { t: 'claim', lane: 'out' },
      { t: 'plan', fn: () => stagingDrop(f, job) },
      { t: 'move', pts: [P(DIM.bx - 4.6, -0.3)] },
      { t: 'release', lane: 'out' },
      { t: 'move', pts: [P(-DIM.bx + 4.6, -0.3), P(f.home.x, -2.0), f.home.clone()] },
      { t: 'face', a: -Math.PI / 2 },
    ];
  }
  function startJob(f, job) {
    f.job = job;
    f.steps = job.kind === 'PUTAWAY' ? putawaySteps(f, job) : dispatchSteps(f, job);
  }
  /** Settle a job without animation (queue overflow, or the tab was hidden for a while). */
  function finishInstantly(job) {
    if (job.kind === 'PUTAWAY') {
      hiddenSlots.delete(job.slot);
      awaitingPick.delete(job.baleId);
      padMemo.delete(job.baleId);
    } else pendingPick.delete(job.slot);
  }
  function fastForwardFleet() {
    for (const f of allRigs) {
      if (f.job && f !== loader) finishInstantly(f.job);
      Object.assign(f, { pos: f.home.clone(), heading: -Math.PI / 2, lift: 0.12, turretA: 0, reachX: 0, steps: [], job: null, stagePad: null });
      f.cargo.visible = false;
    }
    jobQueue.splice(0).forEach(finishInstantly);
    laneLock.in = laneLock.out = null;
    outReserved.clear();
    refreshSlots();
    syncInPads();
  }
  function runStep(f, st, dt) {
    switch (st.t) {
      case 'move': {
        st.i = st.i ?? 0;
        const target = st.pts[st.i];
        const dx = target.x - f.pos.x;
        const dz = target.z - f.pos.z;
        const d = Math.hypot(dx, dz);
        let speed = st.rev ? FL.reverse : FL.drive;
        if (d > 0.02) {
          const diff = wrapA(Math.atan2(-dz, dx) + (st.rev ? Math.PI : 0) - f.heading);
          f.heading = wrapA(f.heading + clamp(diff, -FL.turn * dt, FL.turn * dt));
          speed *= Math.max(0.15, Math.cos(Math.min(Math.abs(diff), Math.PI / 2))); // slow down while steering
        }
        const step = speed * dt;
        if (d <= step) {
          f.pos.x = target.x;
          f.pos.z = target.z;
          st.i += 1;
          if (st.i >= st.pts.length) f.steps.shift();
        } else {
          f.pos.x += (dx / d) * step;
          f.pos.z += (dz / d) * step;
        }
        break;
      }
      case 'face': {
        const diff = wrapA(st.a - f.heading);
        if (Math.abs(diff) < 0.01) {
          f.heading = st.a;
          f.steps.shift();
        } else f.heading = wrapA(f.heading + clamp(diff, -FL.turn * dt, FL.turn * dt));
        break;
      }
      case 'lift':
        f.lift = approach(f.lift, st.y, FL.lift * dt);
        if (f.lift === st.y) f.steps.shift();
        break;
      case 'turret': {
        const diff = wrapA(st.a - f.turretA);
        if (Math.abs(diff) < 0.01) {
          f.turretA = st.a;
          f.steps.shift();
        } else f.turretA += clamp(diff, -FL.turret * dt, FL.turret * dt);
        break;
      }
      case 'reach':
        f.reachX = approach(f.reachX, st.x, FL.reach * dt);
        if (f.reachX === st.x) f.steps.shift();
        break;
      case 'wait':
        st.left = (st.left ?? st.d) - dt;
        if (st.left <= 0) f.steps.shift();
        break;
      case 'claim': // wait here until the bay lane is free
        if (!laneLock[st.lane] || laneLock[st.lane] === f) {
          laneLock[st.lane] = f;
          f.steps.shift();
        }
        break;
      case 'release':
        if (laneLock[st.lane] === f) laneLock[st.lane] = null;
        f.steps.shift();
        break;
      case 'plan': // steps decided at the last moment (e.g. which staging pad is free)
        f.steps.shift();
        f.steps.unshift(...st.fn());
        break;
      default:
        st.fn();
        f.steps.shift();
    }
  }
  function updateFleet(dt, t) {
    for (const f of fleet) {
      if (!f.steps.length) {
        f.job = null;
        if (jobQueue.length) startJob(f, jobQueue.shift());
      }
    }
    if (!loader.steps.length) {
      loader.job = null;
      const i = oldestStaged();
      const staged = outPads.filter(Boolean).length;
      if (i >= 0 && (staged >= 4 || t - outPads[i].t > LOAD_AFTER)) {
        loader.job = { kind: 'LOAD' };
        loader.steps = loadSteps();
      }
    }
    for (const f of allRigs) {
      if (f.steps.length) {
        try {
          runStep(f, f.steps[0], dt);
        } catch (err) {
          // Never let one bad job freeze the render loop: settle it and send the truck home.
          console.error('Forklift job failed', err);
          if (f.job && f !== loader) finishInstantly(f.job);
          for (const k of Object.keys(laneLock)) if (laneLock[k] === f) laneLock[k] = null;
          if (f.stagePad != null) outReserved.delete(f.stagePad);
          Object.assign(f, { pos: f.home.clone(), heading: -Math.PI / 2, lift: 0.12, turretA: 0, reachX: 0, steps: [], job: null, stagePad: null });
          f.cargo.visible = false;
          refreshSlots();
          syncInPads();
        }
      }
      f.g.position.set(f.pos.x, 0, f.pos.z);
      f.g.rotation.y = f.heading;
      f.turret.position.y = f.lift;
      f.turret.rotation.y = f.turretA;
      f.reach.position.x = f.reachX;
      f.mastInner.position.y = 1.1 + Math.max(0, f.lift - 0.3) * 0.95;
      f.beacon.visible = !!f.job && Math.sin(t * 9 + f.phase) > 0; // amber beacon flashes while working
    }
  }

  /* ---------- lane monitors: a live occupancy screen above every lane entrance ---------- */
  const monitorRoot = new THREE.Group();
  scene.add(monitorRoot);
  const MON_W = 1.9;
  const MON_H = 1.19;
  const monScreenGeo = keep(new THREE.PlaneGeometry(MON_W, MON_H));
  const monBezelGeo = boxGeo(MON_W + 0.1, MON_H + 0.1, 0.08);
  const monRodGeo = keep(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8));
  const monBezelMat = std({ color: '#0b1220', roughness: 0.4, metalness: 0.5 });
  const monRodMat = std({ color: '#475569', roughness: 0.4, metalness: 0.6 });
  const monitors = [];
  LANE_INFO.forEach(({ lane, block, x }) => {
    const outer = new THREE.Group();
    outer.position.set(x, RACK_H + 0.4 + MON_H / 2, block.dir * (DIM.laneMouth + 0.15));
    const inner = new THREE.Group();
    const bezel = new THREE.Mesh(monBezelGeo, monBezelMat);
    bezel.position.z = -0.05;
    bezel.castShadow = true;
    const screen = new THREE.Mesh(monScreenGeo, new THREE.MeshBasicMaterial({ toneMapped: false }));
    screen.userData.lane = lane;
    inner.add(bezel, screen);
    outer.add(inner);
    for (const sx of [-0.6, 0.6]) {
      const rod = new THREE.Mesh(monRodGeo, monRodMat);
      rod.position.set(sx, -MON_H / 2 - 0.2, -0.05);
      outer.add(rod);
    }
    monitorRoot.add(outer);
    monitors.push({ lane, outer, inner, screen, key: '', x, dir: block.dir, side: 0, flip: false, cells: null, flash: new Map() });
  });
  // Monitors redraw once per frame at most, so a data refresh and the forklift bookkeeping that
  // follows it in the same tick settle before anything is compared or flashed.
  let monitorsDirty = true;
  let flashExpiry = Infinity;
  const updateMonitors = () => {
    monitorsDirty = true;
  };
  function drawMonitors() {
    monitorsDirty = false;
    if (!data) return;
    const nowS = performance.now() / 1000;
    flashExpiry = Infinity;
    const sel = selection?.slot && SLOT_STATUSES.has(selection.status) ? SLOT_BY_KEY.get(selection.slot) : null;
    const alertsByLane = new Map();
    for (const inc of hazards?.incidents ?? []) {
      const lane = incidentAnchor(inc)?.lane;
      if (!lane) continue;
      const cur = alertsByLane.get(lane) ?? { count: 0, sev: 'INFO' };
      cur.count += 1;
      if (SEVERITY[inc.severity].rank > SEVERITY[cur.sev].rank) cur.sev = inc.severity;
      alertsByLane.set(lane, cur);
    }
    for (const m of monitors) {
      let filled = 0;
      const cells = [];
      for (let r = 1; r <= ROWS; r++) {
        cells.push(
          SHELVES.map((shelf) => {
            const id = occupantAt(slotKeyOf(m.lane, shelf, r));
            if (!id) return 'free';
            filled += 1;
            if (hazards?.ghost?.has(id)) return 'ghost';
            return data.byId.get(id)?.status === 'QC_HOLD' ? 'qc' : 'filled';
          })
        );
      }
      const alerts = alertsByLane.get(m.lane) ?? { count: 0, sev: null };
      const selectedCell = sel && sel.lane === m.lane ? [sel.row - 1, sel.level] : null;
      // Slots that were just filled or emptied glow for a few seconds (+1 / −1 next to the count).
      if (m.cells)
        cells.forEach((col, r) =>
          col.forEach((st, l) => {
            if ((m.cells[r][l] === 'free') !== (st === 'free')) m.flash.set(`${r},${l}`, { add: st !== 'free', until: nowS + 3 });
          })
        );
      m.cells = cells;
      for (const [k, f] of m.flash) {
        if (f.until <= nowS) m.flash.delete(k);
        else flashExpiry = Math.min(flashExpiry, f.until);
      }
      const key = `${cells.map((c) => c.join(',')).join('|')}#${alerts.count}${alerts.sev}#${selectedCell}#${m.flip}#${[...m.flash.keys()].join(';')}`;
      if (key === m.key) continue;
      m.key = key;
      const c = laneMonitorCanvas({ lane: m.lane, filled, cap: ROWS * SHELVES.length, cells, alerts, selectedCell, flip: m.flip, flash: m.flash });
      m.screen.material.map?.dispose();
      m.screen.material.map = makeTex(c);
      m.screen.material.needsUpdate = true;
    }
  }
  // Redraw once web fonts are ready so the screens use Inter / JetBrains Mono.
  document.fonts?.ready.then(() => {
    if (disposed) return;
    monitors.forEach((m) => (m.key = ''));
    updateMonitors();
  });

  /* ---------- data-driven updates ---------- */
  let data = null;
  let selection = null;
  let selTarget = null;
  const filledIds = [];
  const filledKeys = [];
  const emptyKeys = [];

  function baleColor(b) {
    if (!b) return tmpColor.set('#ffffff');
    if (data.colorMode === 'grade') return tmpColor.set(GRADE_META[b.grade]?.hex3d ?? '#ffffff');
    if (data.colorMode === 'age') return ageColor(tmpColor, (data.now - firstStoredTs(b)) / DAY);
    if (b.status === 'QC_HOLD') return tmpColor.set(STATUS_META.QC_HOLD.hex);
    return tmpColor.set(pal.bale);
  }

  function rebuildSlots() {
    if (!data) return;
    let fi = 0;
    let ei = 0;
    let di = 0;
    const ep = emptyEdgeAttr.array;
    const tiltMap = hazards?.tilt;
    const ghost = hazards?.ghost;
    const rot = new THREE.Matrix4();
    const lift = new THREE.Matrix4();
    for (const s of SLOTS) {
      if (!data.shelves.has(s.shelf)) continue;
      m4.makeTranslation(s.x, levelBaseY(s.level) - 0.025, s.z);
      deckMesh.setMatrixAt(di++, m4);
      m4.makeTranslation(s.x, s.y, s.z);
      const baleId = occupantAt(s.key);
      if (baleId) {
        // Leaning stacks pivot about their base towards the access aisle (lean exaggerated ×1.8 for visibility).
        const deg = tiltMap?.get(`${s.lane}:${s.row}`);
        if (deg) m4.makeTranslation(s.x, 0.1, s.z).multiply(rot.makeRotationZ(-THREE.MathUtils.degToRad(deg * 1.8))).multiply(lift.makeTranslation(0, s.y - 0.1, 0));
        filledMesh.setMatrixAt(fi, m4);
        filledMesh.setColorAt(fi, ghost?.has(baleId) ? tmpColor.set('#9a8fc4') : baleColor(data.byId.get(baleId)));
        filledIds[fi] = baleId;
        filledKeys[fi] = s.key;
        fi++;
      } else {
        emptyMesh.setMatrixAt(ei, m4);
        emptyKeys[ei] = s.key;
        const off = ei * VPE;
        for (let k = 0; k < VPE; k += 3) {
          ep[off + k] = edgeTemplate[k] + s.x;
          ep[off + k + 1] = edgeTemplate[k + 1] + s.y;
          ep[off + k + 2] = edgeTemplate[k + 2] + s.z;
        }
        ei++;
      }
    }
    filledMesh.count = fi;
    emptyMesh.count = ei;
    deckMesh.count = di;
    for (const m of [filledMesh, emptyMesh, deckMesh]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
    filledMesh.instanceColor.needsUpdate = true;
    emptyEdgeAttr.needsUpdate = true;
    emptyEdgeGeo.setDrawRange(0, (ei * VPE) / 3);
  }

  function rebuildPeripherals() {
    if (!data) return;
    syncInPads();
    const updateTruck = (truck, n, lines, bg, tint) => {
      truck.load.count = Math.min(n, LOAD_SPOTS.length);
      for (let i = 0; i < truck.load.count; i++) truck.load.setColorAt(i, tmpColor.set(tint));
      if (truck.load.instanceColor) truck.load.instanceColor.needsUpdate = true;
      truck.load.computeBoundingSphere();
      if (truck.count !== n) {
        truck.count = n;
        resprite(truck.label, lines(n), { bg, radius: 12, padX: 14, padY: 6 });
      }
    };
    updateTruck(
      inbound,
      data.inTransit,
      (n) => [{ text: `Inbound · ${n} in transit`, size: 36, weight: 700 }],
      'rgba(146,64,14,0.92)',
      '#f7dc9a'
    );
    updateTruck(
      outbound,
      data.dispatched24h,
      (n) => [{ text: `Outbound · ${n} in 24 h`, size: 36, weight: 700 }],
      'rgba(51,65,85,0.92)',
      '#d6d3cb'
    );
  }

  function resolveTarget(b) {
    if (!b) return null;
    if (b.slot && SLOT_STATUSES.has(b.status) && SLOT_BY_KEY.has(b.slot)) {
      const s = SLOT_BY_KEY.get(b.slot);
      return { kind: 'slot', slot: s, pos: new V3(s.x, s.y, s.z), floor: new V3(s.x, 0.06, s.z), pinY: RACK_H + 1.15, box: true };
    }
    if (b.status === 'RECEIVING') {
      const i = padOf.get(b.id) ?? -1;
      const p = (RECEIVING_SPOTS[i] ?? new V3(IN_BAY.laneX, 0.55, 4.8)).clone();
      return { kind: 'pad', pos: p, floor: new V3(p.x, 0.06, p.z), pinY: 2.6, box: i >= 0 };
    }
    if (b.status === 'IN_TRANSIT') {
      const p = INBOUND_TRUCK.clone().add(new V3(-1.8, 2.0, 0));
      return { kind: 'inbound', pos: p, floor: new V3(p.x, 0.06, p.z), pinY: 4.0, box: false };
    }
    if (b.status === 'DISPATCHED') {
      const p = OUTBOUND_TRUCK.clone().add(new V3(-1.8, 2.0, 0));
      return { kind: 'outbound', pos: p, floor: new V3(p.x, 0.06, p.z), pinY: 4.0, box: false };
    }
    return null;
  }

  function pathPoints(b, t) {
    const Y = 0.14;
    const P = (x, y, z) => new V3(x, y, z);
    const truckFront = P(INBOUND_TRUCK.x + 5.0, Y, INBOUND_TRUCK.z);
    const gateIn = P(-DIM.bx + 0.9, Y, INBOUND_TRUCK.z);
    const toSlot = (s) => {
      const ax = s.x + DIM.lanePitch / 2;
      const zl = s.dir * 1.6;
      return [truckFront, gateIn, P(-DIM.bx + 3.4, Y, zl), P(ax, Y, zl), P(ax, Y, s.z), P(ax, s.y, s.z), P(s.x + 0.78, s.y, s.z)];
    };
    if (t.kind === 'slot') return toSlot(t.slot);
    if (t.kind === 'pad') return [truckFront, gateIn, P(IN_BAY.laneX, Y, 1.0), P(IN_BAY.laneX, Y, t.pos.z), P(t.pos.x, t.pos.y, t.pos.z)];
    if (t.kind === 'inbound') return [P(-64, Y, INBOUND_TRUCK.z), P(INBOUND_TRUCK.x - 4.5, Y, INBOUND_TRUCK.z)];
    if (t.kind === 'outbound') {
      const tail = P(OUTBOUND_TRUCK.x - 4.4, Y, OUTBOUND_TRUCK.z);
      const s = b.lastSlot ? SLOT_BY_KEY.get(b.lastSlot) : null;
      if (!s) return [P(DIM.bx - 2.2, Y, 0), P(DIM.bx - 0.9, Y, OUTBOUND_TRUCK.z), tail];
      const ax = s.x + DIM.lanePitch / 2;
      const zl = s.dir * 1.6;
      return [P(s.x + 0.78, s.y, s.z), P(ax, s.y, s.z), P(ax, Y, s.z), P(ax, Y, zl), P(DIM.bx - 3.4, Y, zl), P(DIM.bx - 0.9, Y, OUTBOUND_TRUCK.z), tail];
    }
    return [];
  }

  function rebuildPath(points) {
    if (pathMesh) {
      selGroup.remove(pathMesh);
      pathMesh.geometry.dispose();
      pathMesh = null;
    }
    const curve = points.length > 1 ? roundedPolyline(points) : null;
    if (!curve) return;
    const len = curve.getLength();
    const geo = new THREE.TubeGeometry(curve, Math.max(24, Math.ceil(len * 5)), 0.075, 8, false);
    flowTex.repeat.set(Math.max(1, len / 0.9), 1);
    pathMesh = new THREE.Mesh(geo, pathMat);
    pathMesh.renderOrder = 5;
    selGroup.add(pathMesh);
  }

  function applySelection() {
    selTarget = resolveTarget(selection);
    if (!selTarget) {
      selGroup.visible = false;
      return;
    }
    const t = selTarget;
    selGroup.visible = true;
    selBox.visible = t.box;
    selEdges.visible = t.box;
    selBox.position.copy(t.pos);
    selEdges.position.copy(t.pos);
    pinBaseY = t.pinY;
    pin.position.set(t.pos.x, pinBaseY, t.pos.z);
    const top = t.pos.y + DIM.bale.h / 2 + 0.06;
    const len = Math.max(0.05, pinBaseY - top);
    for (const m of [beam, beamGlow]) {
      m.scale.set(1, len, 1);
      m.position.set(t.pos.x, top + len / 2, t.pos.z);
    }
    ring.position.copy(t.floor);
    selLabel.position.set(t.pos.x, pinBaseY + 1.6, t.pos.z);
    const caption = selection.slot && SLOT_STATUSES.has(selection.status) ? selection.slot : STATUS_META[selection.status]?.label ?? '';
    const key = `${selection.id}|${caption}`;
    if (key !== selLabelKey) {
      selLabelKey = key;
      resprite(selLabel, [{ text: `${selection.id} · ${caption}`, size: 36, weight: 700, mono: true, color: '#e0f7fb' }], { bg: 'rgba(8,15,30,0.88)', border: ACCENT, radius: 12, padX: 14, padY: 6 });
    }
    rebuildPath(pathPoints(selection, t));
    updateMonitors();
  }

  /* ---------- camera rig ---------- */
  let camAnim = null;
  function flyTo(pos, target, fov = camera.fov, dur = 1200) {
    const dist = camera.position.distanceTo(pos);
    camAnim = { p0: camera.position.clone(), p1: pos.clone(), t0: controls.target.clone(), t1: target.clone(), f0: camera.fov, f1: fov, start: performance.now(), dur, arc: Math.min(10, dist * 0.16) };
  }
  /** Fly to a point keeping the current viewing direction (top-down stays top-down). */
  function flyFocus(target, dist) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (dir.y > 0.96) {
      flyTo(new V3(target.x, target.y + dist * 1.7, target.z + 0.01), target, camera.fov, 1100);
      return;
    }
    if (dir.y < 0.45) {
      dir.y = 0.45;
      dir.normalize();
    }
    flyTo(target.clone().add(dir.multiplyScalar(dist)), target, clamp(camera.fov, 34, 46), 1100);
  }
  function stepCamAnim(now) {
    if (!camAnim) return;
    const k = clamp((now - camAnim.start) / camAnim.dur, 0, 1);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(camAnim.p0, camAnim.p1, e);
    camera.position.y += Math.sin(Math.PI * e) * camAnim.arc;
    controls.target.lerpVectors(camAnim.t0, camAnim.t1, e);
    camera.fov = camAnim.f0 + (camAnim.f1 - camAnim.f0) * e;
    camera.updateProjectionMatrix();
    if (k >= 1) camAnim = null;
  }
  function presetPose(name) {
    const aspect = camera.aspect || 1.6;
    if (name === 'top') {
      const fov = 30;
      const halfH = Math.max(19.5, 33 / aspect);
      const d = halfH / Math.tan(THREE.MathUtils.degToRad(fov / 2));
      return { pos: new V3(0, d, 0.01), target: new V3(0, 0, 0), fov };
    }
    if (name === 'heatmap' || name === 'evac') {
      const fov = 34;
      const halfH = Math.max(name === 'evac' ? 24 : 19.5, 33 / aspect);
      const d = halfH / Math.tan(THREE.MathUtils.degToRad(fov / 2));
      return { pos: new V3(0, d * 0.93, d * 0.37), target: new V3(0, 0, 0), fov };
    }
    if (name === 'aisle') {
      if (selTarget?.kind === 'slot') {
        const s = selTarget.slot;
        // Forklift's-eye view: stand at the mouth of the access aisle beside the lane
        // and look down it at the slot's rack face.
        return {
          pos: new V3(s.x + DIM.lanePitch / 2, 2.8, s.dir * (DIM.laneMouth - 3.4)),
          target: new V3(s.x + 0.25, s.y, s.z),
          fov: 55,
        };
      }
      return { pos: new V3(-DIM.bx - 5.5, 4.4, 0), target: new V3(6, 0.6, 0), fov: 52 };
    }
    const fov = 40;
    const dist = 27 + 25 / clamp(aspect, 0.5, 2.2);
    const target = new V3(0, 0.5, 0);
    return { pos: new V3(0.92, 0.8, 1).normalize().multiplyScalar(dist).add(target), target, fov };
  }
  controls.addEventListener('start', () => {
    camAnim = null;
    cbRef.current?.onUserCamera?.();
  });

  /* ---------- picking & hover ---------- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickTargets = [markerRoot, monitorRoot, filledMesh, emptyMesh, recMesh, stageMesh, trapBody, trapLed, inbound.group, outbound.group];
  function pickAt(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickTargets, true);
    // Alert badges draw on top of everything, so they win even when a bale is nearer.
    const badge = hits.find((h) => h.object.userData.incidentId);
    if (badge) return { kind: 'incident', incidentId: badge.object.userData.incidentId };
    for (const h of hits) {
      const o = h.object;
      const id = h.instanceId;
      if (o.userData.incidentId) return { kind: 'incident', incidentId: o.userData.incidentId };
      if ((o === trapBody || o === trapLed) && id != null) return { kind: 'trap', trapId: TRAPS[id].id };
      if (o.userData.lane && monitorRoot.visible) return { kind: 'lane', lane: o.userData.lane };
      if (o === filledMesh && id != null && id < filledMesh.count) return { kind: 'bale', baleId: filledIds[id], slotKey: filledKeys[id] };
      if (o === emptyMesh && id != null && id < emptyMesh.count) return { kind: 'empty', slotKey: emptyKeys[id] };
      if (o === recMesh && id != null && id < recMesh.count && inPads[recIdx[id]]) return { kind: 'bale', baleId: inPads[recIdx[id]], padPos: IN_BAY.pads[recIdx[id]] };
      if (o === stageMesh && id != null && id < stageMesh.count && outPads[stageIdx[id]]) return { kind: 'bale', baleId: outPads[stageIdx[id]].id, padPos: OUT_BAY.pads[stageIdx[id]] };
      if (o.userData.truck) return { kind: 'truck', which: o.userData.truck };
    }
    return null;
  }
  const hitKey = (hit) => (hit ? `${hit.kind}:${hit.baleId ?? hit.slotKey ?? hit.which ?? hit.incidentId ?? hit.trapId ?? hit.lane}` : null);
  let hoverKey = null;
  let lastPointer = null;
  let hoverDirty = false;
  let pointerDown = null;
  let dragged = false;
  function updateHover(hit) {
    const key = hitKey(hit);
    if (key !== hoverKey) {
      hoverKey = key;
      const p = hit?.slotKey ? SLOT_BY_KEY.get(hit.slotKey) : hit?.padPos ?? null;
      if (p) {
        hoverEdges.position.set(p.x, p.y, p.z);
        hoverEdges.visible = true;
      } else hoverEdges.visible = false;
      if (!pointerDown) canvas.style.cursor = hit ? 'pointer' : 'grab';
    }
    cbRef.current?.onHover?.(hit, lastPointer?.x ?? 0, lastPointer?.y ?? 0);
  }
  const onMove = (e) => {
    lastPointer = { x: e.clientX, y: e.clientY };
    hoverDirty = true;
    if (pointerDown && !dragged && Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 5) {
      dragged = true;
      updateHover(null);
    }
  };
  const onDown = (e) => {
    pointerDown = { x: e.clientX, y: e.clientY };
    dragged = false;
    canvas.style.cursor = 'grabbing';
  };
  const onUp = (e) => {
    const wasClick = pointerDown && !dragged && e.button === 0;
    pointerDown = null;
    canvas.style.cursor = hoverKey ? 'pointer' : 'grab';
    hoverDirty = true;
    if (wasClick) cbRef.current?.onPick?.(pickAt(e.clientX, e.clientY));
  };
  const onLeave = () => {
    lastPointer = null;
    updateHover(null);
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);

  /* ---------- resize ---------- */
  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  /* ---------- intro & render loop ---------- */
  const intro = presetPose('iso');
  camera.position.copy(intro.pos).multiplyScalar(1.7).add(new V3(-30, 30, 0));
  controls.target.copy(intro.target);
  camera.fov = intro.fov;
  camera.updateProjectionMatrix();
  flyTo(intro.pos, intro.target, intro.fov, 2200);

  const clock = new THREE.Clock();
  let raf = 0;
  let disposed = false;
  function frame() {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    if (rawDt > 2) fastForwardFleet(); // tab was hidden: settle jobs instead of replaying them
    const t = clock.elapsedTime;
    stepCamAnim(performance.now());
    controls.update();

    const breathe = 0.5 + 0.5 * Math.sin(t * 2.2);
    entryCurtain.material.opacity = 0.05 + 0.07 * breathe;
    exitCurtain.material.opacity = 0.05 + 0.07 * (1 - breathe);

    updateFleet(dt, t);

    if (selGroup.visible) {
      pin.position.y = pinBaseY + Math.sin(t * 2.4) * 0.16;
      pin.rotation.y += dt * 1.6;
      halo.scale.setScalar(1 + 0.12 * Math.sin(t * 4));
      const f = (t * 0.7) % 1;
      ring.scale.setScalar(0.6 + f * 1.8);
      ring.material.opacity = 0.9 * (1 - f);
      const glow = 0.5 + 0.5 * Math.sin(t * 4);
      selBox.material.opacity = 0.12 + 0.14 * glow;
      selEdges.material.opacity = 0.55 + 0.45 * glow;
      if (pathMesh) flowTex.offset.x -= dt * 1.5;
    }

    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      const k = (t - p.t0) / p.dur;
      if (k >= 1) {
        scene.remove(p.mesh);
        p.mesh.material.dispose();
        pulses.splice(i, 1);
      } else {
        p.mesh.scale.setScalar(1 + k * 0.45);
        p.mesh.material.opacity = 0.6 * (1 - k);
      }
    }

    for (const it of overlayItems) {
      const k = 0.5 + 0.5 * Math.sin(t * it.speed + it.phase);
      for (const [m, lo, hi] of it.pulse) m.opacity = lo + (hi - lo) * k;
      const mk = it.marker;
      if (mk) {
        mk.sprite.position.y = it.baseY + Math.sin(t * 1.7 + it.phase) * 0.13;
        const s = it.critical ? 1 + 0.07 * k : 1;
        mk.sprite.scale.set(mk.w * s, mk.h * s, 1);
      }
    }
    for (const id in beamMats) {
      const m = beamMats[id];
      if (beamState[id] === 'BREACHED') {
        m.color.set('#c084fc');
        m.opacity = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 9));
      } else {
        m.color.set('#ff2d55');
        m.opacity = 0.55 + 0.1 * Math.sin(t * 3);
      }
    }
    for (const id in zoneBeamMats) {
      const m = zoneBeamMats[id];
      const st = zoneState[id];
      if (st === 'TRIGGERED') {
        m.color.set('#ef4444');
        m.opacity = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 10));
      } else if (st === 'ACTIVE') {
        m.color.set('#f59e0b');
        m.opacity = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3));
      } else {
        m.color.set(pal === PALETTES.dark ? '#64748b' : '#94a3b8');
        m.opacity = 0.35;
      }
    }
    trapState.forEach((st, i) => {
      tmpColor.set(TRAP_LED[st] ?? '#22c55e');
      if (st === 'TRIGGERED' || st === 'ACTIVITY') tmpColor.multiplyScalar(0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 6 + i)));
      trapLed.setColorAt(i, tmpColor);
    });
    trapLed.instanceColor.needsUpdate = true;
    for (const p of mistSystems.values()) {
      const arr = p.geometry.attributes.position.array;
      for (let i = 1; i < arr.length; i += 3) {
        arr[i] -= dt * 2.4;
        if (arr[i] < 0) arr[i] = p.userData.top;
      }
      p.geometry.attributes.position.needsUpdate = true;
    }
    if (evacRoot.visible) evacTex.offset.x -= dt * 1.2;
    if (monitorRoot.visible) {
      // Monitors swivel to face the camera and tilt up a little when viewed from above.
      for (const m of monitors) {
        const dx = camera.position.x - m.outer.position.x;
        const dz = camera.position.z - m.outer.position.z;
        m.outer.rotation.y = Math.atan2(dx, dz);
        m.inner.rotation.x = -clamp(Math.atan2(camera.position.y - m.outer.position.y, Math.hypot(dx, dz)), 0, 0.75);
        // Which side of the lane the camera is on (with hysteresis) decides whether R1 reads left or right.
        if (dx > 1.5) m.side = 1;
        else if (dx < -1.5) m.side = -1;
        const flip = m.dir * m.side > 0;
        if (flip !== m.flip) {
          m.flip = flip;
          monitorsDirty = true;
        }
      }
    }
    if (monitorsDirty || performance.now() / 1000 >= flashExpiry) drawMonitors();

    if (hoverDirty && lastPointer && !pointerDown) {
      hoverDirty = false;
      updateHover(pickAt(lastPointer.x, lastPointer.y));
    }
    renderer.render(scene, camera);
  }
  frame();

  /* ---------- public API ---------- */
  return {
    setTheme(name) {
      pal = PALETTES[name] ?? PALETTES.dark;
      themeHooks.forEach((fn) => fn(pal));
      rebuildSlots();
    },
    setData(d) {
      data = d;
      rebuildSlots();
      rebuildPeripherals();
      if (selection) applySelection();
      updateMonitors();
    },
    setSelection(bale) {
      selection = bale;
      selLabelKey = '';
      applySelection();
    },
    focusSelection() {
      if (!selTarget) return;
      flyFocus(selTarget.pos.clone(), selTarget.kind === 'slot' ? 15 : 20);
    },
    focusIncident(inc) {
      const a = inc && incidentAnchor(inc);
      if (!a) return;
      flyFocus(new V3(a.x, a.kind === 'zone' ? 0 : Math.min(a.y, 2.5), a.z), a.kind === 'zone' ? 26 : a.kind === 'column' ? 17 : 14);
    },
    setHazards(h) {
      hazards = h;
      selectedIncidentId = h.selectedIncidentId ?? null;
      const key = `${[...h.tilt].map(([k, v]) => `${k}=${v.toFixed(1)}`).join('|')}#${[...h.ghost].join(',')}`;
      if (key !== tiltKey) {
        tiltKey = key;
        rebuildSlots();
      }
      trapState = h.traps.map((t) => t.status);
      beamState = h.beams;
      zoneState = Object.fromEntries(h.zones.map((z) => [z.id, z.suppressionState]));
      h.zones.forEach((z) => z.lanes && setMist(z.id, z.suppressionState === 'TRIGGERED'));
      buildOverlays();
      updateMonitors();
      if (viewMode === 'heatmap') {
        renderHeat();
        updateZoneLabels();
      }
      if (viewMode === 'evac') rebuildEvac();
    },
    setViewMode(mode, field) {
      viewMode = mode;
      if (field) heatField = field;
      applyViewMode();
    },
    setOverlays(on) {
      overlaysOn = !!on;
      buildOverlays();
    },
    setPreset(name) {
      const p = presetPose(name);
      flyTo(p.pos, p.target, p.fov, 1300);
    },
    setAutoRotate(on) {
      controls.autoRotate = !!on;
    },
    pulse(item) {
      let pos = null;
      if (item.slot && SLOT_BY_KEY.has(item.slot)) {
        const s = SLOT_BY_KEY.get(item.slot);
        pos = new V3(s.x, s.y, s.z);
      } else if (item.kind === 'ARRIVE') pos = RECEIVING_SPOTS[padOf.get(item.baleId)] ?? null;
      if (!pos) return;
      const color = item.kind === 'DISPATCH' ? '#e2e8f0' : item.kind === 'ARRIVE' ? STATUS_META.RECEIVING.hex : STATUS_META.STORED.hexDark;
      pulseAt(pos.x, pos.y, pos.z, color);
    },
    /** Live warehouse event → a forklift job (put-away / dispatch) or a simple pulse. */
    handleEvent(item) {
      if (!item) return;
      if (item.kind === 'PUTAWAY' && SLOT_BY_KEY.has(item.slot)) {
        hiddenSlots.set(item.slot, item.baleId);
        awaitingPick.add(item.baleId); // stays on its receiving pad until a forklift lifts it
        jobQueue.push({ kind: 'PUTAWAY', slot: item.slot, baleId: item.baleId });
      } else if (item.kind === 'DISPATCH' && SLOT_BY_KEY.has(item.slot)) {
        pendingPick.set(item.slot, item.baleId);
        jobQueue.push({ kind: 'DISPATCH', slot: item.slot, baleId: item.baleId });
      } else {
        this.pulse(item);
        return;
      }
      while (jobQueue.length > 4) finishInstantly(jobQueue.shift()); // never fall far behind live data
      refreshSlots();
      syncInPads();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      if (pathMesh) pathMesh.geometry.dispose();
      scene.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        mats.forEach((m) => {
          m.map?.dispose();
          m.dispose();
        });
        o.geometry?.dispose();
      });
      disposables.forEach((d) => d.dispose?.());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

/* ============================================================================
 * 6. REACT UI
 * ========================================================================== */
const panelCls =
  'rounded-2xl border border-slate-200/80 bg-white/85 shadow-sm shadow-slate-900/[0.03] backdrop-blur dark:border-white/[0.07] dark:bg-slate-900/45 dark:shadow-black/20';
const glassCls = 'border border-slate-200/80 bg-white/85 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-950/70';

function StatusBadge({ status, size = 'sm' }) {
  const m = STATUS_META[status];
  if (!m) return null;
  const pad = size === 'xs' ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-[11px]';
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10 ${pad}`}>
      <Icon name={m.icon} className={`h-3 w-3 ${m.fg}`} strokeWidth={2.2} />
      {m.label}
    </span>
  );
}

function StepBadge({ kind }) {
  if (kind === 'completed')
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10">
        <Icon name="check" className="h-3 w-3 text-[#0ca30c]" strokeWidth={2.6} />
        Completed
      </span>
    );
  if (kind === 'pending')
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-white/20 dark:text-slate-400">
        <Icon name="clock" className="h-3 w-3" strokeWidth={2.2} />
        Pending
      </span>
    );
  return <StatusBadge status={kind} />;
}

function TimeAgo({ ts }) {
  const now = useNow();
  return <span>{fmtAgo(ts, now)}</span>;
}

/** Ticking duration. Seconds are shown only while it is live and under a day,
 *  so long spans stay compact. */
function LiveDuration({ from, to = null }) {
  const now = useNow();
  if (from == null) return <span>—</span>;
  const ms = (to ?? now) - from;
  return <span className="tabular-nums">{fmtDuration(ms, to == null && ms < DAY)}</span>;
}

function LiveClock() {
  const now = useNow();
  const tz = useMemo(() => new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '', []);
  return (
    <div className="hidden text-right leading-tight sm:block">
      <div className="font-mono text-[15px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">
        {DTF.timeS.format(now)} <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{tz}</span>
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{DTF.long.format(now)}</div>
    </div>
  );
}

function Sparkline({ values, format, label = 'Trend', w = 108, h = 34 }) {
  const [hover, setHover] = useState(null);
  if (values.length < 2) return null;
  const W = w;
  const H = h;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (W - pad * 2), pad + (1 - (v - min) / span) * (H - pad * 2)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    setHover(clamp(Math.round(((x - pad) / (W - pad * 2)) * (values.length - 1)), 0, values.length - 1));
  };
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block overflow-visible"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`${label} over the last ${values.length} updates, now ${format(values[values.length - 1])}`}
      >
        <path d={d} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="stroke-slate-300 dark:stroke-slate-600" />
        {hover != null && <line x1={pts[hover][0]} x2={pts[hover][0]} y1="0" y2={H} strokeWidth="1" strokeDasharray="2 2" className="stroke-slate-400 dark:stroke-slate-500" />}
        <circle cx={last[0]} cy={last[1]} r="4" className="fill-cyan-500 stroke-white dark:fill-cyan-400 dark:stroke-slate-900" strokeWidth="2" />
        {hover != null && hover !== values.length - 1 && <circle cx={pts[hover][0]} cy={pts[hover][1]} r="4" className="fill-slate-500 stroke-white dark:fill-slate-300 dark:stroke-slate-900" strokeWidth="2" />}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute -top-8 right-0 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
          {hover === values.length - 1 ? 'Now' : `${values.length - 1 - hover} updates ago`} · {format(values[hover])}
        </div>
      )}
    </div>
  );
}

const sevCounts = (list) => list.reduce((c, i) => ({ ...c, [i.severity]: c[i.severity] + 1 }), { CRITICAL: 0, WARNING: 0, INFO: 0 });

/* One colour per KPI card: tinted gradient surface + solid gradient icon tile. */
const KPI_TONES = {
  blue: { card: 'from-[#2a78d6]/[0.09] border-[#2a78d6]/20 dark:from-[#3987e5]/[0.16] dark:border-[#3987e5]/25', icon: 'from-[#5598e7] to-[#1c5cab] shadow-[#2a78d6]/30' },
  amber: { card: 'from-[#eda100]/[0.11] border-[#eda100]/25 dark:from-[#eda100]/[0.15] dark:border-[#eda100]/25', icon: 'from-[#f5b82e] to-[#c27c00] shadow-[#eda100]/30' },
  red: { card: 'from-[#ef4444]/[0.08] border-[#ef4444]/20 dark:from-[#ef4444]/[0.15] dark:border-[#ef4444]/25', icon: 'from-[#f87171] to-[#c81e1e] shadow-[#ef4444]/30' },
  violet: { card: 'from-[#8b5cf6]/[0.09] border-[#8b5cf6]/20 dark:from-[#8b5cf6]/[0.17] dark:border-[#8b5cf6]/25', icon: 'from-[#a78bfa] to-[#6d28d9] shadow-[#8b5cf6]/30' },
  yellow: { card: 'from-[#eab308]/[0.11] border-[#eab308]/25 dark:from-[#eab308]/[0.15] dark:border-[#eab308]/25', icon: 'from-[#facc15] to-[#a87f03] shadow-[#eab308]/30' },
  teal: { card: 'from-[#14b8a6]/[0.10] border-[#14b8a6]/20 dark:from-[#14b8a6]/[0.16] dark:border-[#14b8a6]/25', icon: 'from-[#2dd4bf] to-[#0f766e] shadow-[#14b8a6]/30' },
};

function KpiCard({ tone, icon, label, value, unit, meta, right, title, onClick, active = false }) {
  const t = KPI_TONES[tone];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      aria-pressed={onClick ? active : undefined}
      className={`relative flex min-w-0 items-center gap-2.5 rounded-xl border bg-gradient-to-br to-white px-3 py-2 text-left shadow-sm transition dark:to-slate-900/40 ${t.card} ${
        active ? 'ring-2 ring-cyan-500/50' : ''
      } ${onClick ? 'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500' : ''}`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br text-white shadow-md ${t.icon}`}>
        <Icon name={icon} className="h-[18px] w-[18px]" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-medium leading-4 text-slate-500 dark:text-slate-400">{label}</span>
        <span className="flex min-w-0 items-baseline gap-1">
          <span className="shrink-0 text-[21px] font-bold leading-6 tracking-tight text-slate-900 dark:text-white">{value}</span>
          {unit && <span className="shrink-0 text-[11px] font-semibold text-slate-400 dark:text-slate-500">{unit}</span>}
          {meta && <span className="ml-1 min-w-0 truncate text-[10.5px] text-slate-500 dark:text-slate-400">{meta}</span>}
        </span>
      </span>
      {right && <span className="hidden shrink-0 sm:contents">{right}</span>}
    </Tag>
  );
}

/** Occupancy ring: the arc carries severity (accent → warning → critical) and
 *  the track is a lighter step of the same hue. */
function RingGauge({ value }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const tone = value >= 0.9 ? ['stroke-[#d03b3b]', 'stroke-[#d03b3b]/15'] : value >= 0.8 ? ['stroke-[#fab219]', 'stroke-[#fab219]/20'] : ['stroke-[#2a78d6] dark:stroke-[#5598e7]', 'stroke-[#2a78d6]/15 dark:stroke-[#5598e7]/20'];
  return (
    <span className="relative h-10 w-10 shrink-0" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label="Occupancy rate">
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" className={tone[1]} />
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value)} className={`${tone[0]} transition-[stroke-dashoffset] duration-700`} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[9.5px] font-bold text-slate-700 dark:text-slate-200">{Math.round(value * 100)}%</span>
    </span>
  );
}
function CritPill({ n }) {
  if (!n) return null;
  return <span className="shrink-0 self-start rounded-full bg-[#d03b3b] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{n} critical</span>;
}
const SECURITY_SHORT = { RFID_LOST: 'RFID', BEAM_BREACH: 'IR beam', DOCK_MISMATCH: 'dock' };

function TopBar({ stats, risk, baseline, healthHistory, theme, onToggleTheme, live, onToggleLive, onKpi, activeTab }) {
  const filled = useCountUp(stats.filled);
  const transit = useCountUp(stats.counts.IN_TRANSIT);
  const thermal = useCountUp(risk.kpi.thermal);
  const security = useCountUp(risk.kpi.security);
  const pest = useCountUp(risk.kpi.pestActive);
  const health = useCountUp(risk.health.overall);
  const band = healthBand(risk.health.overall);
  const sinceLabel = DTF.time.format(baseline.at);
  const filledDelta = stats.filled - baseline.filled;
  const thermalCrit = risk.open.filter((i) => (i.type === 'THERMAL' || i.type === 'SMOKE') && i.severity === 'CRITICAL').length;
  const securityOpen = risk.open.filter((i) => i.category === 'SECURITY');
  const securityCrit = securityOpen.filter((i) => i.severity === 'CRITICAL').length;
  const securityMeta = [...new Set(securityOpen.map((i) => SECURITY_SHORT[i.type]).filter(Boolean))].join(' · ') || 'all perimeters armed';
  return (
    <header className="relative z-10 shrink-0 border-b border-slate-200/80 bg-white/70 backdrop-blur-md dark:border-white/[0.06] dark:bg-[#070c17]/80">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <OptimonLogo className="h-5 w-auto shrink-0 sm:h-7" />
          <span className="hidden h-8 w-px bg-slate-200 sm:block dark:bg-white/10" />
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">
              BaleTrack <span className="text-cyan-600 dark:text-cyan-400">3D</span>
              <span className="ml-2 hidden font-medium text-slate-400 lg:inline">/ Warehouse Operations &amp; Risk Command</span>
            </h1>
            <p className="truncate text-[12px] text-slate-500 dark:text-slate-400">
              {WAREHOUSE_DATA.meta.warehouseName} · {WAREHOUSE_DATA.meta.facility}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleLive}
            aria-pressed={live}
            title={live ? 'Pause the live event stream' : 'Resume the live event stream'}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            <span className="relative flex h-2.5 w-2.5">
              {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0ca30c] opacity-60" />}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live ? 'bg-[#0ca30c]' : 'bg-slate-400'}`} />
            </span>
            {live ? 'Live' : 'Paused'}
            <Icon name={live ? 'pause' : 'play'} className="h-3.5 w-3.5 text-slate-400" strokeWidth={2.2} />
          </button>
          <LiveClock />
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 px-4 pb-2.5 pt-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          tone="blue"
          icon="warehouse"
          label="Capacity vs filled"
          value={Math.round(filled)}
          unit={`/ ${CAPACITY}`}
          meta={`${stats.available} free`}
          title={`${stats.available} available · ${(stats.rate * 100).toFixed(1)} % occupied · ${filledDelta >= 0 ? '+' : '−'}${Math.abs(filledDelta)} since ${sinceLabel}`}
          right={<RingGauge value={stats.rate} />}
        />
        <KpiCard
          tone="amber"
          icon="truck"
          label="Active in-transit"
          value={Math.round(transit)}
          unit="bales"
          meta={`${stats.counts.RECEIVING} at gate E-1`}
          title={`TW-3 → WH 15-1 · ${stats.counts.RECEIVING} receiving at E-1 · ${stats.dispatched24h} dispatched in 24 h`}
        />
        <KpiCard
          tone="red"
          icon="flame"
          label="Thermal warnings"
          value={Math.round(thermal)}
          meta={`max ${risk.kpi.maxCore.toFixed(1)} °C`}
          title={`Max core ${risk.kpi.maxCore.toFixed(1)} °C · ${risk.kpi.primedZones} suppression zone(s) primed · click for Fire & Temp`}
          right={<CritPill n={thermalCrit} />}
          onClick={() => onKpi('FIRE')}
          active={activeTab === 'FIRE'}
        />
        <KpiCard
          tone="violet"
          icon="shield"
          label="Security breaches"
          value={Math.round(security)}
          meta={securityMeta}
          title={`${risk.kpi.securityTypes.join(' · ') || 'All perimeters armed'} · click for Security & Theft`}
          right={<CritPill n={securityCrit} />}
          onClick={() => onKpi('SECURITY')}
          active={activeTab === 'SECURITY'}
        />
        <KpiCard
          tone="yellow"
          icon="rodent"
          label="Active pest traps"
          value={Math.round(pest)}
          unit={`/ ${TRAPS.length}`}
          meta={`${risk.kpi.pestTriggered} triggered · ${risk.kpi.pestActivity} IR`}
          title="Triggered traps and infrared activity · click for Rodent Traps"
          onClick={() => onKpi('PEST')}
          active={activeTab === 'PEST'}
        />
        <KpiCard
          tone="teal"
          icon="heart"
          label="Facility health"
          value={`${Math.round(health)}%`}
          meta={
            <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
              <Icon name={band.icon} className={`h-3 w-3 ${band.fg}`} strokeWidth={2.6} />
              {band.label}
            </span>
          }
          title={`${risk.severityTotals.CRITICAL} critical · ${risk.severityTotals.WARNING} warnings open`}
          right={<Sparkline values={healthHistory} w={56} h={28} label="Health index trend" format={(v) => `${v.toFixed(1)} %`} />}
        />
      </div>
    </header>
  );
}

/* ---------------- Left panel: inventory search & selector ---------------- */
const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9+]/g, '');
const SORTS = {
  recent: { label: 'Latest activity', fn: (a, b) => lastTs(b) - lastTs(a) },
  id: { label: 'Bale ID', fn: (a, b) => a.id.localeCompare(b.id) },
  location: { label: 'Location', fn: (a, b) => (SLOT_BY_KEY.get(a.slot)?.idx ?? 1e9) - (SLOT_BY_KEY.get(b.slot)?.idx ?? 1e9) || a.id.localeCompare(b.id) },
  weight: { label: 'Weight', fn: (a, b) => b.weightKg - a.weightKg },
};
const PAGE = 60;

function BaleCard({ bale, selected, onSelect, hazards }) {
  const cats = hazards ? [...new Set(hazards.map((h) => h.category))] : [];
  const ts = lastTs(bale);
  return (
    <li>
      <button
        type="button"
        data-bale={bale.id}
        onClick={() => onSelect(bale.id)}
        aria-current={selected ? 'true' : undefined}
        aria-label={`Bale ${bale.id}, ${STATUS_META[bale.status].label}, ${locationLabel(bale)}, ${zoneLabel(bale)}`}
        className={`group relative w-full rounded-xl border p-3 text-left outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-cyan-500 ${
          selected
            ? 'border-cyan-500/60 bg-cyan-50 shadow-[0_0_0_1px_rgba(6,182,212,0.35),0_10px_28px_-14px_rgba(6,182,212,0.6)] dark:bg-cyan-400/[0.07]'
            : 'border-slate-200/90 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-white/[0.06] dark:bg-slate-900/40 dark:hover:border-white/15 dark:hover:bg-slate-800/50'
        }`}
      >
        {selected && <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-cyan-500 dark:bg-cyan-400" />}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_META[bale.status].dot}`} />
            <span className="truncate font-mono text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">{bale.id}</span>
            {bale.tracked && <Icon name="star" className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" strokeWidth={1.5} />}
            {cats.map((c) => (
              <span key={c} title={`Open ${HAZARD_CATS[c].label} incident`} className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${HAZARD_CATS[c].tile}`}>
                <Icon name={HAZARD_CATS[c].icon} className="h-3 w-3" strokeWidth={2.2} />
              </span>
            ))}
          </div>
          <StatusBadge status={bale.status} size="xs" />
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[13px]">
          <Icon name="pin" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{locationLabel(bale)}</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span className="truncate text-slate-500 dark:text-slate-400">{zoneLabel(bale)}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <Icon name="clock" className="h-3 w-3 shrink-0" />
            {fmtShort(ts)} · <TimeAgo ts={ts} />
          </span>
          <span className="shrink-0">
            {WAREHOUSE_DATA.meta.warehouseId.replace('WH-', 'WH ')} · {bale.grade} · {bale.weightKg} kg
          </span>
        </div>
      </button>
    </li>
  );
}

function InventoryPanel({ className, tabs, hazardsByBale, bales, counts, selectedId, onSelect, searchRef, query, setQuery, filter, setFilter }) {
  const [sortKey, setSortKey] = useState('recent');
  const [limit, setLimit] = useState(PAGE);
  const listRef = useRef(null);
  const haystack = useMemo(() => {
    const m = new Map();
    for (const b of bales) m.set(b.id, normalize(`${b.id} ${b.slot ?? ''} ${b.lastSlot ?? ''} ${b.lot} ${b.variety} grade${b.grade} ${b.origin} ${STATUS_META[b.status].label}`));
    return m;
  }, [bales]);
  const filtered = useMemo(() => {
    const q = normalize(query);
    // "L-4" / "L4" means exactly lane 4 (not L-42…L-48); anything else is a free-text match.
    const laneMatch = query.trim().match(/^l-?(\d+)\/?$/i);
    const lane = laneMatch && LANE_INFO.has(Number(laneMatch[1])) ? Number(laneMatch[1]) : null;
    const out = bales.filter((b) => {
      if (lane != null) {
        const s = SLOT_BY_KEY.get(b.slot) ?? SLOT_BY_KEY.get(b.lastSlot);
        if (s?.lane !== lane) return false;
        return filter === 'ALL' || (filter === 'AT_RISK' ? hazardsByBale.has(b.id) : filter === 'WATCH' ? b.tracked : b.status === filter);
      }
      if (filter === 'WATCH') {
        if (!b.tracked) return false;
      } else if (filter === 'AT_RISK') {
        if (!hazardsByBale.has(b.id)) return false;
      } else if (filter !== 'ALL' && b.status !== filter) return false;
      return !q || haystack.get(b.id).includes(q);
    });
    out.sort(SORTS[sortKey].fn);
    return out;
  }, [bales, filter, query, sortKey, haystack, hazardsByBale]);

  useEffect(() => setLimit(PAGE), [query, filter, sortKey]);
  const selIndex = filtered.findIndex((b) => b.id === selectedId);
  useEffect(() => {
    if (selIndex >= limit) setLimit(selIndex + 20);
  }, [selIndex, limit]);
  useEffect(() => {
    // Scroll only the list box (scrollIntoView would also scroll the page on mobile).
    const box = listRef.current;
    const el = box?.querySelector(`[data-bale="${selectedId}"]`);
    if (!box || !el) return;
    const br = box.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.top < br.top) box.scrollBy({ top: er.top - br.top - 8, behavior: 'smooth' });
    else if (er.bottom > br.bottom) box.scrollBy({ top: er.bottom - br.bottom + 8, behavior: 'smooth' });
  }, [selectedId]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!filtered.length) return;
      const next = selIndex < 0 ? 0 : clamp(selIndex + (e.key === 'ArrowDown' ? 1 : -1), 0, filtered.length - 1);
      onSelect(filtered[next].id);
    } else if (e.key === 'Enter') {
      const exact = bales.find((b) => b.id === query.trim());
      const target = exact ?? (selIndex >= 0 ? filtered[selIndex] : filtered[0]);
      if (target) onSelect(target.id);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  const shown = filtered.slice(0, limit);
  return (
    <section className={`flex min-h-0 flex-col ${panelCls} ${className}`} aria-label="Bale inventory">
      <div className="border-b border-slate-200/80 px-4 pb-3 pt-4 dark:border-white/[0.06]">
        {tabs}
        <div className="mt-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">All inventory</h2>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{counts.ALL} bales tracked</span>
        </div>
        <div className="relative mt-3">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search bale, lane, lot…"
            aria-label="Search bales"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-16 font-mono text-[13px] text-slate-900 outline-none transition placeholder:font-sans placeholder:text-slate-400 focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-500/15 dark:border-white/10 dark:bg-slate-950/60 dark:text-white dark:focus:bg-slate-950"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white">
              <Icon name="x" className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">/</kbd>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          Try{' '}
          <button type="button" className="font-mono text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-300" onClick={() => { setQuery('411275167'); onSelect('411275167'); }}>
            411275167
          </button>{' '}
          or{' '}
          <button type="button" className="font-mono text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-300" onClick={() => setQuery('L-47')}>
            L-47
          </button>{' '}
          · ↑↓ to step · Enter to locate
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ring-1 ring-inset transition ${
                  active
                    ? 'bg-slate-900 text-white ring-slate-900 dark:bg-white dark:text-slate-900 dark:ring-white'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-white/[0.03] dark:text-slate-300 dark:ring-white/10 dark:hover:bg-white/[0.07]'
                }`}
              >
                {f.status && <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[f.status].dot}`} />}
                {f.icon && <Icon name={f.icon} className={`h-3 w-3 ${f.iconCls}`} strokeWidth={f.icon === 'star' ? 1.5 : 2.2} />}
                {f.label}
                <span className={`tabular-nums ${active ? 'opacity-70' : 'text-slate-400 dark:text-slate-500'}`}>{counts[f.key]}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span>
          {filtered.length ? `Showing ${Math.min(limit, filtered.length)} of ${filtered.length}` : 'No matches'}
        </span>
        <label className="inline-flex items-center gap-1">
          <Icon name="sort" className="h-3.5 w-3.5" />
          <span className="sr-only">Sort by</span>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="cursor-pointer rounded-md bg-transparent py-0.5 pr-1 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-cyan-500/40 dark:text-slate-200 dark:[color-scheme:dark]">
            {Object.entries(SORTS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div ref={listRef} className="wh-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {filtered.length === 0 ? (
          <div className="grid h-40 place-items-center rounded-xl border border-dashed border-slate-300 text-center text-[13px] text-slate-500 dark:border-white/10 dark:text-slate-400">
            <div>
              <Icon name="search" className="mx-auto mb-2 h-5 w-5" />
              No bales match “{query}”.
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {shown.map((b) => (
              <BaleCard key={b.id} bale={b} selected={b.id === selectedId} onSelect={onSelect} hazards={hazardsByBale.get(b.id)} />
            ))}
          </ul>
        )}
        {filtered.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="mt-2 w-full rounded-xl border border-slate-200 py-2 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
            Show {Math.min(PAGE, filtered.length - limit)} more
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------------- Left panel: unified risk & inventory feed ---------------- */
const FEED_TABS = [
  { key: 'ALL', label: 'All Inventory', short: 'All', icon: 'box' },
  // One short word each so five tabs fit the slim left column (full name in the tooltip).
  ...CAT_ORDER.map((c) => ({ key: c, label: HAZARD_CATS[c].label, short: c === 'SECURITY' ? 'Theft' : HAZARD_CATS[c].short, icon: HAZARD_CATS[c].icon, cat: c })),
];
const chipBase = 'inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10';
const chipPad = (size) => (size === 'xs' ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-[11px]');

function SeverityBadge({ severity, size = 'sm' }) {
  const m = SEVERITY[severity];
  return (
    <span className={`${chipBase} ${chipPad(size)}`}>
      <Icon name={m.icon} className={`h-3 w-3 ${m.fg}`} strokeWidth={2.4} />
      {m.label}
    </span>
  );
}
function IncidentStatusBadge({ status, size = 'sm' }) {
  const m = INCIDENT_STATUS[status];
  return (
    <span className={`${chipBase} ${chipPad(size)}`}>
      <Icon name={m.icon} className={`h-3 w-3 ${m.fg}`} strokeWidth={2.4} />
      {m.label}
    </span>
  );
}
function CategoryChip({ cat }) {
  const m = HAZARD_CATS[cat];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${m.tile}`}>
      <Icon name={m.icon} className="h-3 w-3" strokeWidth={2.2} />
      {m.label}
    </span>
  );
}

function FeedTabs({ tab, setTab, risk }) {
  return (
    <div role="tablist" aria-label="Risk and inventory feeds" className="grid grid-cols-5 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/[0.04]">
      {FEED_TABS.map((t) => {
        const active = tab === t.key;
        const c = t.cat ? risk.counts[t.cat] : null;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            title={t.label}
            onClick={() => setTab(t.key)}
            className={`relative flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-1 pb-1 pt-1.5 text-[10.5px] font-semibold transition ${
              active ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
            }`}
          >
            <Icon name={t.icon} className={`h-4 w-4 ${t.cat ? HAZARD_CATS[t.cat].fg : ''}`} />
            <span className="max-w-full truncate">{t.short}</span>
            {c && c.open > 0 && (
              <span
                className={`absolute right-0.5 top-0.5 min-w-[16px] rounded-full px-1 text-center text-[9px] font-bold leading-[15px] tabular-nums ${
                  c.CRITICAL > 0 ? 'bg-[#d03b3b] text-white' : 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                }`}
                aria-label={`${c.open} open, ${c.CRITICAL} critical`}
              >
                {c.open}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function IncidentCard({ inc, selected, onSelect }) {
  const done = inc.steps.filter((s) => s.done).length;
  const cat = HAZARD_CATS[inc.category];
  return (
    <li>
      <button
        type="button"
        data-incident={inc.id}
        onClick={() => onSelect(inc.id)}
        aria-current={selected ? 'true' : undefined}
        aria-label={`${SEVERITY[inc.severity].label} ${INCIDENT_TYPES[inc.type]}: ${inc.title}, ${incidentLocation(inc)}`}
        className={`group relative w-full overflow-hidden rounded-xl border py-3 pl-4 pr-3 text-left outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-cyan-500 ${
          selected
            ? 'border-cyan-500/60 bg-cyan-50 shadow-[0_0_0_1px_rgba(6,182,212,0.35),0_10px_28px_-14px_rgba(6,182,212,0.6)] dark:bg-cyan-400/[0.07]'
            : 'border-slate-200/90 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-white/[0.06] dark:bg-slate-900/40 dark:hover:border-white/15 dark:hover:bg-slate-800/50'
        }`}
      >
        <span className={`absolute inset-y-0 left-0 w-1 ${SEVERITY[inc.severity].stripe}`} />
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <Icon name={cat.icon} className={`h-3.5 w-3.5 shrink-0 ${cat.fg}`} strokeWidth={2.2} />
            <span className="font-mono">{inc.id}</span>
            <span>·</span>
            <span className="truncate">{INCIDENT_TYPES[inc.type]}</span>
          </span>
          <SeverityBadge severity={inc.severity} size="xs" />
        </div>
        <p className="mt-1.5 text-[13px] font-semibold leading-snug text-slate-900 dark:text-white">{inc.title}</p>
        <p className="mt-1 flex min-w-0 items-center gap-1 text-[11.5px] text-slate-500 dark:text-slate-400">
          <Icon name="pin" className="h-3 w-3 shrink-0" />
          <span className="truncate">{incidentLocation(inc)}</span>
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
          <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{readingText(inc)}</span>
          <span className="text-slate-500 dark:text-slate-400">
            {inc.status === 'RESOLVED' ? 'Resolved ' : ''}
            <TimeAgo ts={inc.status === 'RESOLVED' ? inc.resolvedAt : inc.detectedAt} />
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <IncidentStatusBadge status={inc.status} size="xs" />
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div className="h-full rounded-full bg-[#0ca30c] transition-[width] duration-500" style={{ width: `${(done / inc.steps.length) * 100}%` }} />
          </div>
          <span className="text-[10.5px] tabular-nums text-slate-500 dark:text-slate-400">
            {done}/{inc.steps.length}
          </span>
        </div>
      </button>
    </li>
  );
}

function SystemsCard({ title, icon, right, children }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Icon name={icon} className="h-3.5 w-3.5" />
          {title}
        </span>
        {right && <span className="text-[10.5px] text-slate-500 dark:text-slate-400">{right}</span>}
      </div>
      {children}
    </div>
  );
}
const tileCls = 'rounded-lg bg-white px-2 py-1.5 ring-1 ring-inset ring-slate-200/80 dark:bg-slate-900/50 dark:ring-white/[0.06]';
const SUPPRESSION_META = {
  STANDBY: { label: 'Standby', icon: 'check', fg: 'text-[#0a8f0a] dark:text-[#3fcf3f]' },
  ACTIVE: { label: 'Active · primed', icon: 'alert', fg: 'text-[#b37900] dark:text-[#fab219]' },
  TRIGGERED: { label: 'Triggered', icon: 'octagon', fg: 'text-[#d03b3b] dark:text-[#f07272]' },
};
function FireSystems({ zones }) {
  return (
    <SystemsCard title="Suppression & humidity zones" icon="droplet" right={`${zones.filter((z) => z.suppressionState !== 'STANDBY').length} primed`}>
      <div className="grid grid-cols-2 gap-1.5">
        {zones.map((z) => {
          const sm = SUPPRESSION_META[z.suppressionState];
          const rhBad = z.rh > TH.rhHigh.warn || z.rh < TH.rhLow.warn;
          return (
            <div key={z.id} className={tileCls} title={`${z.name} · ${z.suppression} · laser detector ${z.detector}`}>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                <span className="font-mono">{z.id}</span>
                <span className={`inline-flex items-center gap-0.5 font-mono ${rhBad ? 'text-[#b37900] dark:text-[#fab219]' : 'text-slate-600 dark:text-slate-300'}`}>
                  <Icon name="droplet" className="h-3 w-3" />
                  {Math.round(z.rh)}%
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-slate-500 dark:text-slate-400">
                <Icon name={sm.icon} className={`h-3 w-3 shrink-0 ${sm.fg}`} strokeWidth={2.4} />
                {sm.label}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10.5px] text-slate-500 dark:text-slate-400">Humidity bands: below 30 % static risk · above 85 % mould risk.</p>
    </SystemsCard>
  );
}
function SecuritySystems({ beams, docks, fleet }) {
  return (
    <SystemsCard title="Perimeter, docks & fleet" icon="lock">
      <div className="flex flex-wrap gap-1">
        {Object.entries(beams).map(([id, st]) => (
          <span key={id} className={`inline-flex items-center gap-1 ${tileCls} py-0.5 text-[10.5px] font-semibold text-slate-700 dark:text-slate-200`} title={`HV-1 IR beam ${id} · ${BEAM_GEOM[id].label}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${st === 'BREACHED' ? 'animate-pulse bg-[#a855f7]' : 'bg-[#0ca30c]'}`} />
            {id} · {st === 'BREACHED' ? 'Breached' : 'Armed'}
          </span>
        ))}
      </div>
      <div className="mt-2 space-y-1">
        {docks.map((d) => (
          <div key={d.id} className={`flex items-center justify-between gap-2 ${tileCls} text-[11px]`}>
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              Dock {d.id} <span className="font-normal text-slate-500 dark:text-slate-400">· {d.type}</span>
            </span>
            <span className="truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">{d.truck}</span>
            <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-slate-700 dark:text-slate-200">
              <Icon name={d.alert ? 'octagon' : 'activity'} className={`h-3 w-3 ${d.alert ? SEVERITY.CRITICAL.fg : 'text-[#0a8f0a] dark:text-[#3fcf3f]'}`} strokeWidth={2.4} />
              {d.state}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1">
        {fleet.map((f) => (
          <div key={f.id} className={`${tileCls} py-1 text-[10.5px]`} title={f.task}>
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{f.id}</span>
              <span className={`font-semibold ${f.state === 'Hold' ? SEVERITY.WARNING.fg : 'text-slate-500 dark:text-slate-400'}`}>{f.state}</span>
            </div>
            <div className="truncate font-mono text-[9.5px] text-slate-400">{f.wo ?? 'no work order'}</div>
          </div>
        ))}
      </div>
    </SystemsCard>
  );
}
const TRAP_META = {
  ARMED: { label: 'Armed', dot: 'bg-[#0ca30c]' },
  TRIGGERED: { label: 'Triggered', dot: 'bg-[#eab308]' },
  ACTIVITY: { label: 'IR activity', dot: 'bg-[#fde047] ring-1 ring-[#a16207]/50' },
  LOW_BATTERY: { label: 'Low battery', dot: 'bg-slate-400' },
};
function PestSystems({ traps, onTrap }) {
  const armed = traps.filter((t) => t.status === 'ARMED').length;
  return (
    <SystemsCard title="IoT trap network" icon="rodent" right={`${armed}/${traps.length} armed`}>
      <div className="grid grid-cols-6 gap-1">
        {traps.map((t) => {
          const m = TRAP_META[t.status];
          const alert = t.status !== 'ARMED';
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTrap(t)}
              title={`Trap #${pad2(t.id)} · ${t.where} · ${m.label} · battery ${t.battery} %`}
              className={`flex flex-col items-center rounded-md py-1 font-mono text-[10px] font-semibold ring-1 ring-inset transition ${
                alert ? 'bg-[#eab308]/15 text-slate-900 ring-[#eab308]/50 dark:text-white' : 'bg-white text-slate-600 ring-slate-200/80 hover:ring-slate-300 dark:bg-slate-900/50 dark:text-slate-300 dark:ring-white/[0.06]'
              }`}
            >
              <span className={`mb-0.5 h-1.5 w-1.5 rounded-full ${m.dot} ${t.status === 'TRIGGERED' ? 'animate-pulse' : ''}`} />#{pad2(t.id)}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
        {Object.values(TRAP_META).map((m) => (
          <span key={m.label} className="inline-flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
            {m.label}
          </span>
        ))}
      </div>
    </SystemsCard>
  );
}
function StructuralSystems({ columnTilts }) {
  const scale = 6;
  return (
    <SystemsCard title="Stack gyro readings · top 6" icon="stack" right={`${columnTilts.length} stacks`}>
      <ul className="space-y-1.5">
        {columnTilts.slice(0, 6).map((c) => {
          const tone = c.deg >= TH.tilt.crit ? 'bg-[#d03b3b]' : c.deg >= TH.tilt.warn ? 'bg-[#fab219]' : 'bg-slate-400';
          return (
            <li key={c.key} className="flex items-center gap-2 text-[11px]">
              <span className="w-[62px] font-mono font-semibold text-slate-800 dark:text-slate-100">
                L-{c.lane}/R{c.row}
              </span>
              <div className="relative h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-white/10">
                <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, (c.deg / scale) * 100)}%` }} />
                <span className="absolute -inset-y-0.5 w-px bg-[#fab219]" style={{ left: `${(TH.tilt.warn / scale) * 100}%` }} />
                <span className="absolute -inset-y-0.5 w-px bg-[#d03b3b]" style={{ left: `${(TH.tilt.crit / scale) * 100}%` }} />
              </div>
              <span className="w-9 text-right font-mono text-slate-700 dark:text-slate-200">{c.deg.toFixed(1)}°</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10.5px] text-slate-500 dark:text-slate-400">
        Ticks: {TH.tilt.warn}° warning · {TH.tilt.crit}° collapse threshold · {CAPACITY * 6} strap strain gauges online.
      </p>
    </SystemsCard>
  );
}

function IncidentFeed({ className, tabs, cat, incidents, risk, query, setQuery, searchRef, selectedIncidentId, onSelectIncident, onTrap }) {
  const [sev, setSev] = useState('ALL');
  const [view, setView] = useState('open');
  const [showSystems, setShowSystems] = useState(true);
  useEffect(() => setSev('ALL'), [cat]);
  const meta = HAZARD_CATS[cat];
  const catIncs = useMemo(() => incidents.filter((i) => i.category === cat), [incidents, cat]);
  const openList = catIncs.filter((i) => i.status !== 'RESOLVED');
  const resolvedList = catIncs.filter((i) => i.status === 'RESOLVED');
  const base = view === 'open' ? openList : resolvedList;
  const sc = sevCounts(base);
  const q = normalize(query);
  const list = base
    .filter((i) => sev === 'ALL' || i.severity === sev)
    .filter((i) => !q || normalize(`${i.id} ${i.title} ${incidentLocation(i)} ${i.baleId ?? ''} ${INCIDENT_TYPES[i.type]} ${i.zone ?? ''} ${laneLabelOf(i)} ${i.sensor?.id ?? ''}`).includes(q))
    .sort(view === 'open' ? bySeverity : (a, b) => b.resolvedAt - a.resolvedAt);
  const sevChips = [['ALL', 'All', base.length], ...SEVERITY_ORDER.map((s) => [s, SEVERITY[s].label, sc[s]])];
  return (
    <section className={`flex min-h-0 flex-col ${panelCls} ${className}`} aria-label={`${meta.label} incidents`}>
      <div className="border-b border-slate-200/80 px-4 pb-3 pt-4 dark:border-white/[0.06]">
        {tabs}
        <div className="mt-3 flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <Icon name={meta.icon} className={`h-4 w-4 ${meta.fg}`} />
            {meta.label}
          </h2>
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold dark:bg-white/[0.05]" role="group" aria-label="Incident state">
            {[
              ['open', `Open ${openList.length}`],
              ['resolved', `Resolved ${resolvedList.length}`],
            ].map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={view === k}
                onClick={() => setView(k)}
                className={`rounded-md px-2 py-0.5 transition ${view === k ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="relative mt-3">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('');
              if (e.key === 'Enter' && list[0]) onSelectIncident(list[0].id);
            }}
            placeholder="Search incident, bale ID, bay (L-46)…"
            aria-label="Search incidents"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 font-mono text-[13px] text-slate-900 outline-none transition placeholder:font-sans placeholder:text-slate-400 focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-500/15 dark:border-white/10 dark:bg-slate-950/60 dark:text-white dark:focus:bg-slate-950"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white">
              <Icon name="x" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by severity">
          {sevChips.map(([k, l, n]) => {
            const active = sev === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSev(k)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ring-1 ring-inset transition ${
                  active
                    ? 'bg-slate-900 text-white ring-slate-900 dark:bg-white dark:text-slate-900 dark:ring-white'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-white/[0.03] dark:text-slate-300 dark:ring-white/10 dark:hover:bg-white/[0.07]'
                }`}
              >
                {k !== 'ALL' && <Icon name={SEVERITY[k].icon} className={`h-3 w-3 ${active ? '' : SEVERITY[k].fg}`} strokeWidth={2.4} />}
                {l}
                <span className={`tabular-nums ${active ? 'opacity-70' : 'text-slate-400 dark:text-slate-500'}`}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="wh-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <div>
          <button type="button" onClick={() => setShowSystems((v) => !v)} aria-expanded={showSystems} className="mb-2 flex w-full items-center justify-between px-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span>Live systems</span>
            <Icon name="arrowDown" className={`h-3.5 w-3.5 transition ${showSystems ? 'rotate-180' : ''}`} />
          </button>
          {showSystems && (
            <>
              {cat === 'FIRE' && <FireSystems zones={risk.zones} />}
              {cat === 'SECURITY' && <SecuritySystems beams={risk.beams} docks={risk.docks} fleet={risk.fleet} />}
              {cat === 'PEST' && <PestSystems traps={risk.traps} onTrap={onTrap} />}
              {cat === 'STRUCTURAL' && <StructuralSystems columnTilts={risk.columnTilts} />}
            </>
          )}
        </div>
        <div className="px-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {list.length} {view === 'open' ? 'open' : 'resolved'} incident{list.length === 1 ? '' : 's'}
        </div>
        {list.length === 0 ? (
          <div className="grid h-28 place-items-center rounded-xl border border-dashed border-slate-300 text-center text-[12.5px] text-slate-500 dark:border-white/10 dark:text-slate-400">
            <div>
              <Icon name="check" className="mx-auto mb-1.5 h-5 w-5 text-[#0ca30c]" />
              {query ? `No incidents match “${query}”.` : `No ${view} ${meta.label.toLowerCase()} incidents.`}
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map((i) => (
              <IncidentCard key={i.id} inc={i} selected={i.id === selectedIncidentId} onSelect={onSelectIncident} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ---------------- Center panel: 3D viewport ---------------- */
const PRESETS = [
  { key: 'iso', label: 'Overview 3D', icon: 'cube', hint: 'Overview 3D (2)' },
  { key: 'top', label: '2D Blueprint', icon: 'grid', hint: 'Top-down 2D blueprint (1)' },
  { key: 'aisle', label: 'Aisle Focus', icon: 'aisle', hint: 'Aisle-level view of the selected lane (3)' },
  { key: 'heatmap', label: 'Hazard Heatmap', icon: 'heat', hint: 'Hazard heatmap layer (4)' },
  { key: 'evac', label: 'Evacuation Routes', icon: 'evac', hint: 'Emergency evacuation route mode (5)' },
];
const HEAT_FIELDS = [
  { key: 'thermal', label: 'Thermal' },
  { key: 'humidity', label: 'Humidity' },
  { key: 'risk', label: 'Risk index' },
];
const COLOR_MODES = [
  { key: 'status', label: 'Status' },
  { key: 'grade', label: 'Grade' },
  { key: 'age', label: 'Dwell age' },
];

function TooltipBody({ hit, byId, stats, risk, incidentsById }) {
  if (!hit) return null;
  if (hit.kind === 'incident') {
    const inc = incidentsById.get(hit.incidentId);
    if (!inc) return null;
    const cat = HAZARD_CATS[inc.category];
    return (
      <>
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <Icon name={cat.icon} className={`h-3.5 w-3.5 ${cat.fg}`} strokeWidth={2.2} />
            <span className="font-mono">{inc.id}</span>
          </span>
          <SeverityBadge severity={inc.severity} size="xs" />
        </div>
        <div className="mt-1 text-[13px] font-semibold leading-snug text-slate-900 dark:text-white">{inc.title}</div>
        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{incidentLocation(inc)}</div>
        <div className="mt-1 font-mono text-[12px] font-semibold text-slate-800 dark:text-slate-100">
          {readingText(inc)} <span className="font-sans font-normal text-slate-400">· {limitText(inc)}</span>
        </div>
        <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Click to open incident command</div>
      </>
    );
  }
  if (hit.kind === 'lane') {
    const slots = SLOTS.filter((s) => s.lane === hit.lane);
    const filled = slots.filter((s) => stats.occupancy.has(s.key)).length;
    return (
      <>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[14px] font-semibold text-slate-900 dark:text-white">Lane L-{hit.lane}</span>
          <span className={`${chipBase} ${chipPad('xs')}`}>{LANE_INFO.get(hit.lane).block.name}</span>
        </div>
        <div className="mt-1 text-[12px] text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-white">{filled} filled</span> · <span className="font-semibold text-[#16a34a] dark:text-[#4ade80]">{slots.length - filled} available</span> of {slots.length} slots
        </div>
        <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Click to list this lane</div>
      </>
    );
  }
  if (hit.kind === 'trap') {
    const t = risk.traps.find((x) => x.id === hit.trapId);
    if (!t) return null;
    const m = TRAP_META[t.status];
    return (
      <>
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-white">
            <Icon name="rodent" className={`h-4 w-4 ${HAZARD_CATS.PEST.fg}`} />
            Trap #{pad2(t.id)}
          </span>
          <span className={`${chipBase} ${chipPad('xs')}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
            {m.label}
          </span>
        </div>
        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          {t.where} · battery {t.battery} %
        </div>
        {t.incident && <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Click to open {t.incident}</div>}
      </>
    );
  }
  if (hit.kind === 'bale') {
    const b = byId.get(hit.baleId);
    if (!b) return null;
    return (
      <>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[14px] font-semibold text-slate-900 dark:text-white">{b.id}</span>
          <StatusBadge status={b.status} size="xs" />
        </div>
        <div className="mt-1 font-mono text-[12px] text-slate-700 dark:text-slate-200">
          {b.slot ?? 'Receiving bay'} <span className="font-sans text-slate-400">· {zoneLabel(b)}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          Grade {b.grade} · {b.weightKg} kg · {b.variety}
        </div>
        <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Click to track journey</div>
      </>
    );
  }
  if (hit.kind === 'empty') {
    const s = SLOT_BY_KEY.get(hit.slotKey);
    return (
      <>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[14px] font-semibold text-slate-900 dark:text-white">{s.key}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10">
            <Icon name="grid" className="h-3 w-3 text-[#0ca30c]" /> Available
          </span>
        </div>
        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Bay {s.bay} (X) · Shelf {s.shelf} (Y) · Row R{s.row} (Z) · {s.blockName}
        </div>
      </>
    );
  }
  const inboundTruck = hit.which === 'inbound';
  return (
    <>
      <div className="flex items-center gap-2">
        <Icon name="truck" className={`h-4 w-4 ${inboundTruck ? STATUS_META.IN_TRANSIT.fg : STATUS_META.DISPATCHED.fg}`} />
        <span className="text-[13px] font-semibold text-slate-900 dark:text-white">{inboundTruck ? 'Inbound — TW-3 → WH 15-1' : 'Outbound — Exit X-1'}</span>
      </div>
      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
        {inboundTruck ? `${stats.counts.IN_TRANSIT} bales in transit` : `${stats.dispatched24h} bales dispatched in the last 24 h`}
      </div>
      <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Click to list these bales</div>
    </>
  );
}

const WarehouseViewport = forwardRef(function WarehouseViewport(
  { theme, sceneData, hazards, viewMode, heatField, overlaysOn, selectedBale, focus, onPick, onUserCamera, byId, stats, risk, incidentsById },
  ref
) {
  const hostRef = useRef(null);
  const engineRef = useRef(null);
  const tipRef = useRef(null);
  const hoverKeyRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [glError, setGlError] = useState(null);
  const cbRef = useRef({});
  cbRef.current = {
    onPick,
    onUserCamera,
    onHover(hit, x, y) {
      const tip = tipRef.current;
      const host = hostRef.current;
      if (tip && host && hit) {
        const r = host.getBoundingClientRect();
        const tw = tip.offsetWidth || 240;
        const th = tip.offsetHeight || 100;
        let lx = x - r.left + 16;
        let ly = y - r.top + 16;
        if (lx + tw > r.width - 8) lx = x - r.left - tw - 12;
        if (ly + th > r.height - 8) ly = y - r.top - th - 12;
        tip.style.transform = `translate(${Math.max(8, lx)}px, ${Math.max(8, ly)}px)`;
      }
      const key = hit ? `${hit.kind}:${hit.baleId ?? hit.slotKey ?? hit.which ?? hit.incidentId ?? hit.trapId ?? hit.lane}` : null;
      if (key !== hoverKeyRef.current) {
        hoverKeyRef.current = key;
        setHover(hit);
      }
    },
  };

  useEffect(() => {
    let engine;
    try {
      engine = createWarehouseEngine(hostRef.current, cbRef);
    } catch (err) {
      setGlError(err?.message || 'WebGL is not available in this browser.');
      return undefined;
    }
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);
  useEffect(() => engineRef.current?.setTheme(theme), [theme]);
  useEffect(() => engineRef.current?.setData(sceneData), [sceneData]);
  useEffect(() => engineRef.current?.setSelection(selectedBale), [selectedBale]);
  useEffect(() => engineRef.current?.setHazards(hazards), [hazards]);
  useEffect(() => engineRef.current?.setViewMode(viewMode, heatField), [viewMode, heatField]);
  useEffect(() => engineRef.current?.setOverlays(overlaysOn), [overlaysOn]);
  useEffect(() => {
    if (!focus.nonce) return;
    if (focus.incident && !focus.incident.baleId) engineRef.current?.focusIncident(focus.incident);
    else engineRef.current?.focusSelection();
  }, [focus]);
  useImperativeHandle(
    ref,
    () => ({
      setPreset: (n) => engineRef.current?.setPreset(n),
      focusSelection: () => engineRef.current?.focusSelection(),
      focusIncident: (inc) => engineRef.current?.focusIncident(inc),
      setAutoRotate: (v) => engineRef.current?.setAutoRotate(v),
      pulse: (item) => engineRef.current?.pulse(item),
      handleEvent: (item) => engineRef.current?.handleEvent(item),
    }),
    []
  );

  return (
    <div ref={hostRef} className="absolute inset-0">
      {glError && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-500">
          <div>
            <Icon name="alert" className="mx-auto mb-2 h-6 w-6 text-[#eb6834]" />
            3D view unavailable: {glError}
          </div>
        </div>
      )}
      <div
        ref={tipRef}
        className={`pointer-events-none absolute left-0 top-0 z-20 w-max max-w-[260px] rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur transition-opacity duration-150 dark:border-white/10 dark:bg-slate-900/95 ${hover ? 'opacity-100' : 'opacity-0'}`}
        role="tooltip"
      >
        <TooltipBody hit={hover} byId={byId} stats={stats} risk={risk} incidentsById={incidentsById} />
      </div>
    </div>
  );
});

function LegendStrip({ colorMode, viewMode, heatField, overlaysOn }) {
  const sw = 'h-3 w-3 shrink-0 rounded-[3px]';
  const hint = <span className="ml-auto hidden text-[10.5px] text-slate-400 2xl:inline dark:text-slate-500">Drag to orbit · Right-drag to pan · Scroll to zoom · 1–5 presets · F to focus</span>;
  const wrap = 'flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-200/80 px-4 py-2 dark:border-white/[0.06]';
  if (viewMode === 'heatmap') {
    const labels = heatField === 'humidity' ? ['Dry · 25 %', '55 %', 'Wet · 90 %'] : heatField === 'risk' ? ['Low', 'Medium', 'High'] : ['24 °C', '45 °C watch', '60 °C+'];
    return (
      <div className={wrap}>
        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{HEAT_FIELDS.find((f) => f.key === heatField)?.label} heatmap</span>
        <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
          <span>{labels[0]}</span>
          <span className="h-2.5 w-40 rounded-full ring-1 ring-black/5" style={{ background: heatField === 'humidity' ? HUMIDITY_CSS : HEAT_CSS }} />
          <span>{labels[2]}</span>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">{heatField === 'humidity' ? 'Grey = 55 % neutral · orange = static risk · blue = mould risk' : heatField === 'risk' ? 'Weighted by incident severity' : 'Max core temperature per stack'}</span>
        {hint}
      </div>
    );
  }
  if (viewMode === 'evac') {
    return (
      <div className={wrap}>
        <LegendItem swatch={<span className="h-1.5 w-5 rounded-full bg-[#22c55e]" />} label="Escape route" />
        <LegendItem swatch={<span className="h-1.5 w-5 rounded-full bg-[#ef4444]" />} label="Blocked route" />
        <LegendItem swatch={<span className={`${sw} border-2 border-[#16a34a]`} />} label="Emergency exit" />
        <LegendItem swatch={<span className="h-3 w-3 rounded-full border-2 border-[#22c55e]" />} label="Assembly point" />
        <LegendItem swatch={<span className={`${sw} bg-[#dc2626]`} />} label="Fire hydrant" />
        {hint}
      </div>
    );
  }
  const hazardItems = overlaysOn
    ? CAT_ORDER.map((c) => (
        <LegendItem
          key={c}
          swatch={<span className="h-3 w-3 shrink-0 rounded-full" style={{ background: HAZARD_CATS[c].aura, boxShadow: `0 0 8px ${HAZARD_CATS[c].aura}` }} />}
          label={{ FIRE: 'Fire / thermal', SECURITY: 'Theft / tamper', PEST: 'Pest / rodent', STRUCTURAL: 'Unstable stack' }[c]}
        />
      ))
    : [];
  let items;
  if (colorMode === 'grade') {
    items = Object.entries(GRADE_META).map(([g, m]) => <LegendItem key={g} swatch={<span className={`${sw} ${m.swatch}`} />} label={m.label} />);
  } else if (colorMode === 'age') {
    items = [
      <div key="ramp" className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
        <span>0 d</span>
        <span className="h-2.5 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${AGE_STOPS.join(',')})` }} />
        <span>{AGE_MAX_DAYS}+ d in storage</span>
      </div>,
    ];
  } else {
    items = [
      <LegendItem key="s" swatch={<span className={`${sw} bg-[#efe5cf] ring-1 ring-black/10`} />} label="Stored bale" />,
      <LegendItem key="q" swatch={<span className={`${sw} ${STATUS_META.QC_HOLD.dot}`} />} label="QC hold" />,
      <LegendItem key="r" swatch={<span className={`${sw} bg-[#9fdcc4]`} />} label="Receiving" />,
      <LegendItem key="t" swatch={<span className={`${sw} bg-[#f7dc9a]`} />} label="Inbound load" />,
    ];
  }
  return (
    <div className={wrap}>
      {items}
      <LegendItem swatch={<span className={`${sw} border border-[#22c55e] bg-[#86efac]/70 dark:bg-[#4ade80]/25`} />} label="Available slot" />
      <LegendItem swatch={<span className={`${sw} bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]`} />} label="Tracked bale" />
      {hazardItems}
      <LegendItem swatch={<span className={`${sw} bg-[#22c55e]`} />} label="Entry E-1" />
      <LegendItem swatch={<span className={`${sw} bg-[#ef4444]`} />} label="Exit X-1" />
      {hint}
    </div>
  );
}
function LegendItem({ swatch, label }) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-700 dark:text-slate-300">
      {swatch}
      <span>{label}</span>
    </div>
  );
}

function ActivityFeed({ feed, byId, onSelect, onSelectIncident }) {
  return (
    <div className={`w-[290px] rounded-xl px-2.5 py-2 ${glassCls}`}>
      <div className="mb-1 flex items-center justify-between px-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Live activity</span>
        <Icon name="activity" className="h-3.5 w-3.5 text-slate-400" />
      </div>
      <ul>
        {feed.slice(0, 3).map((item) => {
          if (item.kind === 'HAZARD') {
            const cat = HAZARD_CATS[item.cat];
            return (
              <li key={item.id} className="animate-[wh-fade-up_.4s_ease-out]">
                <button type="button" onClick={() => onSelectIncident(item.incidentId)} className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-slate-100 dark:hover:bg-white/5">
                  <Icon name={cat.icon} className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${cat.fg}`} strokeWidth={2.2} />
                  <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-slate-600 dark:text-slate-300">
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">{item.incidentId}</span> {item.text}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">{DTF.time.format(item.ts)}</span>
                </button>
              </li>
            );
          }
          const meta = FEED_META[item.kind];
          const st = STATUS_META[meta.status];
          return (
            <li key={item.id} className="animate-[wh-fade-up_.4s_ease-out]">
              <button
                type="button"
                onClick={() => onSelect(item.baleId)}
                disabled={!byId.has(item.baleId)}
                className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <Icon name={st.icon} className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${st.fg}`} strokeWidth={2.2} />
                <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-slate-600 dark:text-slate-300">
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">{item.baleId}</span> {meta.text(item.slot)}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-slate-400">{DTF.time.format(item.ts)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ViewportPanel({
  className,
  viewportRef,
  theme,
  sceneData,
  hazards,
  viewMode,
  heatField,
  setHeatField,
  overlaysOn,
  setOverlaysOn,
  selectedBale,
  focus,
  onPick,
  preset,
  onPreset,
  onUserCamera,
  autoRotate,
  setAutoRotate,
  colorMode,
  setColorMode,
  shelves,
  toggleShelf,
  feed,
  onSelect,
  onSelectIncident,
  byId,
  stats,
  risk,
  incidentsById,
  details,
  detailsOpen,
  onToggleDetails,
}) {
  const s = selectedBale?.slot ? SLOT_BY_KEY.get(selectedBale.slot) : null;
  const isActive = (k) => (k === 'heatmap' || k === 'evac' ? viewMode === k : viewMode === 'normal' && preset === k);
  const blocked = risk.blockedLanes;
  return (
    <section className={`flex min-h-0 flex-col overflow-hidden ${panelCls} ${className}`} aria-label="3D warehouse view">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-4 py-2.5 dark:border-white/[0.06]">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-300">
            <Icon name="cube" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-white">Warehouse 15-1 · Digital twin</h2>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">North block L-1–L-7 · Main drive aisle · South block L-42–L-48</p>
          </div>
        </div>
        {selectedBale && (
          <nav aria-label="Selected location" className="flex min-w-0 items-center gap-1 overflow-hidden text-[11px] text-slate-500 dark:text-slate-400">
            <span className="hidden sm:inline">WH 15-1</span>
            {s ? (
              <>
                <Icon name="arrowRight" className="hidden h-3 w-3 sm:block" />
                <span className="hidden md:inline">{s.blockName}</span>
                <Icon name="arrowRight" className="hidden h-3 w-3 md:block" />
                <span className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 font-mono font-semibold text-cyan-700 dark:text-cyan-300">
                  {s.bay} · Shelf {s.shelf} · R{s.row}
                </span>
              </>
            ) : (
              <>
                <Icon name="arrowRight" className="hidden h-3 w-3 sm:block" />
                <span className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 font-semibold text-cyan-700 dark:text-cyan-300">{zoneLabel(selectedBale)}</span>
              </>
            )}
          </nav>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <WarehouseViewport
          ref={viewportRef}
          theme={theme}
          sceneData={sceneData}
          hazards={hazards}
          viewMode={viewMode}
          heatField={heatField}
          overlaysOn={overlaysOn}
          selectedBale={selectedBale}
          focus={focus}
          onPick={onPick}
          onUserCamera={onUserCamera}
          byId={byId}
          stats={stats}
          risk={risk}
          incidentsById={incidentsById}
        />

        <div className="pointer-events-none absolute inset-0">
          <div className="pointer-events-auto absolute left-3 top-3 flex flex-col items-start gap-2">
            <div className={`flex rounded-xl p-1 ${glassCls}`} role="group" aria-label="Camera presets">
              {PRESETS.map((p) => {
                const on = isActive(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    title={p.hint}
                    aria-label={p.label}
                    aria-pressed={on}
                    onClick={() => onPreset(p.key)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${
                      on ? 'bg-slate-900 text-white shadow dark:bg-cyan-400 dark:text-slate-950' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                    }`}
                  >
                    <Icon name={p.icon} className="h-4 w-4" />
                    {on && <span className="hidden md:inline">{p.label}</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-1.5">
              <button type="button" title="Fly to selected bale (F)" aria-label="Fly to selected bale" onClick={() => viewportRef.current?.focusSelection()} className={`grid h-8 w-8 place-items-center rounded-lg text-slate-600 transition hover:text-cyan-600 dark:text-slate-300 dark:hover:text-cyan-300 ${glassCls}`}>
                <Icon name="crosshair" />
              </button>
              <button
                type="button"
                title="Auto-rotate"
                aria-label="Toggle auto-rotate"
                aria-pressed={autoRotate}
                onClick={() => setAutoRotate((v) => !v)}
                className={`grid h-8 w-8 place-items-center rounded-lg transition ${autoRotate ? 'border border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300' : `text-slate-600 hover:text-cyan-600 dark:text-slate-300 dark:hover:text-cyan-300 ${glassCls}`}`}
              >
                <Icon name="rotate" />
              </button>
              <button
                type="button"
                title={overlaysOn ? 'Hide hazard overlays' : 'Show hazard overlays'}
                aria-label="Toggle hazard overlays"
                aria-pressed={overlaysOn}
                onClick={() => setOverlaysOn((v) => !v)}
                className={`grid h-8 w-8 place-items-center rounded-lg transition ${overlaysOn ? 'border border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300' : `text-slate-600 hover:text-cyan-600 dark:text-slate-300 dark:hover:text-cyan-300 ${glassCls}`}`}
              >
                <Icon name={overlaysOn ? 'eye' : 'eyeOff'} />
              </button>
              <button
                type="button"
                title={detailsOpen ? 'Hide details (Esc)' : 'Incident command, bale journey & sensor log'}
                aria-label="Toggle details panel"
                aria-pressed={detailsOpen}
                onClick={onToggleDetails}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition ${detailsOpen ? 'border border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300' : `text-slate-600 hover:text-cyan-600 dark:text-slate-300 dark:hover:text-cyan-300 ${glassCls}`}`}
              >
                <Icon name="siren" className="h-4 w-4" />
                Details
                {risk.open.some((i) => i.severity === 'CRITICAL') && <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY.CRITICAL.stripe}`} />}
              </button>
            </div>
          </div>

          {detailsOpen && (
            <div className="pointer-events-auto absolute bottom-3 right-3 top-3 z-10 w-[min(360px,calc(100%-24px))] animate-[wh-slide-in_.22s_ease-out]">
              {details}
            </div>
          )}

          {viewMode === 'heatmap' && !detailsOpen && (
            <div className="pointer-events-auto absolute right-3 top-3">
              <div className={`flex items-center gap-1 rounded-xl p-1 ${glassCls}`} role="group" aria-label="Heatmap layer">
                <Icon name="heat" className="mx-1 hidden h-4 w-4 text-slate-400 sm:block" />
                {HEAT_FIELDS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={heatField === f.key}
                    onClick={() => setHeatField(f.key)}
                    className={`rounded-lg px-2 py-1.5 text-[12px] font-semibold transition ${
                      heatField === f.key ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {viewMode === 'evac' && !detailsOpen && (
            <div className={`pointer-events-auto absolute right-3 top-3 w-[260px] rounded-xl p-3 ${glassCls}`}>
              <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-900 dark:text-white">
                <Icon name="evac" className="h-4 w-4 text-[#16a34a]" />
                Emergency evacuation
              </p>
              <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                {EXITS.length} emergency exits + gates E-1 / X-1 · assembly points A (north) and B (south).
              </p>
              {blocked.length ? (
                <p className="mt-1.5 inline-flex items-start gap-1 text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                  <Icon name="octagon" className={`mt-px h-3.5 w-3.5 shrink-0 ${SEVERITY.CRITICAL.fg}`} strokeWidth={2.4} />
                  {blocked.length} route blocked: access aisle {blocked.map((l) => `L-${l}`).join(', ')}
                </p>
              ) : (
                <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                  <Icon name="check" className="h-3.5 w-3.5 text-[#0ca30c]" strokeWidth={2.6} />
                  All escape routes clear
                </p>
              )}
            </div>
          )}

          <div className={`pointer-events-auto absolute right-3 top-3 flex-col items-end gap-2 ${viewMode === 'normal' && !detailsOpen ? 'flex' : 'hidden'}`}>
            <div className={`flex items-center gap-1 rounded-xl p-1 ${glassCls}`} role="group" aria-label="Colour bales by">
              <Icon name="palette" className="mx-1 hidden h-4 w-4 text-slate-400 sm:block" />
              {COLOR_MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={colorMode === m.key}
                  onClick={() => setColorMode(m.key)}
                  className={`rounded-lg px-2 py-1.5 text-[12px] font-semibold transition ${
                    colorMode === m.key ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className={`flex items-center gap-1 rounded-xl p-1 ${glassCls}`} role="group" aria-label="Visible shelf levels">
              <Icon name="layers" className="mx-1 h-4 w-4 text-slate-400" />
              {SHELVES.map((sh) => {
                const on = shelves.includes(sh);
                return (
                  <button
                    key={sh}
                    type="button"
                    title={`Shelf ${sh} (level ${SHELVES.indexOf(sh) + 1})`}
                    aria-pressed={on}
                    onClick={() => toggleShelf(sh)}
                    className={`grid h-7 w-7 place-items-center rounded-lg font-mono text-[12px] font-bold transition ${
                      on ? 'bg-cyan-500/15 text-cyan-700 ring-1 ring-inset ring-cyan-500/40 dark:text-cyan-300' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  >
                    {sh}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pointer-events-auto absolute bottom-3 left-3 hidden sm:block">
            <ActivityFeed feed={feed} byId={byId} onSelect={onSelect} onSelectIncident={onSelectIncident} />
          </div>
        </div>
      </div>
      <LegendStrip colorMode={colorMode} viewMode={viewMode} heatField={heatField} overlaysOn={overlaysOn} />
    </section>
  );
}

/* ---------------- Right panel: journey & lifecycle timeline ---------------- */
function buildSteps(bale) {
  const kindForLast = { STORED: 'STORED', QC_HOLD: 'QC_HOLD', IN_TRANSIT: 'IN_TRANSIT', RECEIVING: 'RECEIVING', DISPATCHED: 'DISPATCHED' }[bale.status];
  const steps = bale.history.map((h, i) => ({ ...h, kind: i === bale.history.length - 1 ? kindForLast : 'completed', current: i === bale.history.length - 1 }));
  if (bale.status === 'IN_TRANSIT')
    steps.push({ type: 'EXPECTED', title: 'Expected at Warehouse 15-1', site: 'WH 15-1 · Entry Gate E-1', ts: bale.eta, kind: 'pending', note: null, ref: null });
  if (bale.status === 'RECEIVING')
    steps.push({ type: 'STORED', title: 'Put-away to rack slot', site: 'Awaiting slot allocation', ts: null, kind: 'pending', note: null, ref: null });
  return steps.map((s, i) => {
    const prev = steps[i - 1];
    if (!prev || s.ts == null || prev.ts == null) return s;
    return { ...s, gapMs: s.ts - prev.ts, gapLabel: SEGMENT_LABEL[`${prev.type}>${s.type}`] ?? (prev.type === 'TW_OUT' && s.type === 'EXPECTED' ? 'Planned transit' : 'Elapsed') };
  });
}

function JourneyMetrics({ bale }) {
  const h = bale.history;
  const find = (t) => h.find((e) => e.type === t)?.ts ?? null;
  const start = h[0]?.ts ?? null;
  const twOut = find('TW_OUT');
  const whEntry = find('WH_IN') ?? find('STORED');
  const exit = find('DISPATCHED');
  const tiles = [
    { label: 'Total lead time', icon: 'route', from: start, to: exit, sub: exit ? 'production → dispatch' : 'production → now' },
    { label: 'TW-3 → WH 15-1', icon: 'truck', from: twOut, to: whEntry, sub: whEntry ? 'transit leg' : 'on the road' },
    { label: 'Dwell in WH 15-1', icon: 'timer', from: whEntry, to: exit, sub: !whEntry ? 'not arrived yet' : exit ? 'entry → exit' : 'live counter' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {tiles.map((t) => (
        <div key={t.label} className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <div className="flex items-center gap-1 text-[10.5px] font-medium text-slate-500 dark:text-slate-400">
            <Icon name={t.icon} className="h-3 w-3 shrink-0" />
            <span className="truncate">{t.label}</span>
          </div>
          <div className="mt-1 truncate font-mono text-[13px] font-semibold text-slate-900 dark:text-white">{t.from == null ? '—' : <LiveDuration from={t.from} to={t.to} />}</div>
          <div className="truncate text-[10px] text-slate-400 dark:text-slate-500">{t.sub}</div>
        </div>
      ))}
    </div>
  );
}

function RouteStrip({ bale }) {
  const has = (t) => bale.history.some((e) => e.type === t);
  const [ginName, ginCity] = bale.origin.split(' · ');
  const dest = bale.destination ? bale.destination.split(' · ') : null;
  const dispatched = bale.status === 'DISPATCHED';
  const nodes = [
    { label: ginName.replace('Ginning Unit ', 'Gin '), sub: ginCity, icon: 'factory', state: 'done' },
    { label: 'Transit WH 3', sub: 'TW-3', icon: 'warehouse', state: has('TW_OUT') ? 'done' : has('TW_IN') ? 'current' : 'pending' },
    { label: 'WH 15-1', sub: bale.slot ?? (bale.status === 'RECEIVING' ? 'Gate E-1' : bale.lastSlot ?? 'Pending'), icon: 'box', state: dispatched ? 'done' : has('WH_IN') || has('STORED') ? 'current' : 'pending' },
    { label: dest ? dest[0].replace('Spinning Mill', 'Mill') : 'Outbound', sub: dest ? dest[1] : 'Not scheduled', icon: 'truck', state: dispatched ? 'current' : 'pending' },
  ];
  const linkActive = (i) => (i === 1 && bale.status === 'IN_TRANSIT') || (i === 2 && dispatched);
  const nodeCls = {
    done: 'bg-[#0ca30c]/10 text-[#0a8f0a] ring-1 ring-inset ring-[#0ca30c]/40 dark:text-[#3fcf3f]',
    current: 'bg-cyan-500/15 text-cyan-700 ring-1 ring-inset ring-cyan-500/60 shadow-[0_0_0_4px_rgba(34,211,238,0.12)] dark:text-cyan-300',
    pending: 'border border-dashed border-slate-300 bg-transparent text-slate-400 dark:border-white/20',
  };
  return (
    <div className="flex items-start">
      {nodes.map((n, i) => (
        <div key={n.label + i} className="contents">
          <div className="flex w-[64px] shrink-0 flex-col items-center text-center">
            <span className={`grid h-9 w-9 place-items-center rounded-full ${nodeCls[n.state]}`}>
              <Icon name={n.icon} className="h-4 w-4" />
            </span>
            <span className="mt-1.5 w-full truncate text-[10.5px] font-semibold text-slate-700 dark:text-slate-200">{n.label}</span>
            <span className="w-full truncate font-mono text-[9.5px] text-slate-400">{n.sub}</span>
          </div>
          {i < nodes.length - 1 && (
            <div className="mt-[17px] h-0.5 min-w-[8px] flex-1">
              {linkActive(i) ? (
                <div className="wh-march h-0.5 w-full text-cyan-500 dark:text-cyan-400" />
              ) : (
                <div className={`h-0.5 w-full rounded-full ${nodes[i + 1].state !== 'pending' ? 'bg-[#0ca30c]/50' : 'bg-slate-200 dark:bg-white/10'}`} />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Timeline({ bale }) {
  const steps = useMemo(() => buildSteps(bale), [bale]);
  const now = useNow();
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const nodeCls =
          s.kind === 'completed'
            ? 'bg-[#0ca30c]/10 text-[#0a8f0a] ring-1 ring-inset ring-[#0ca30c]/35 dark:text-[#3fcf3f]'
            : s.kind === 'pending'
              ? 'border-2 border-dashed border-slate-300 text-slate-400 dark:border-white/15'
              : `${STATUS_META[s.kind].solid} shadow-lg`;
        const delayed = s.kind === 'pending' && s.type === 'EXPECTED' && s.ts != null && s.ts < now;
        return (
          <li key={`${s.type}-${i}`} className="relative">
            {s.gapMs != null && (
              <div className="relative flex items-center gap-2 py-1 pl-11">
                <span className="absolute bottom-0 left-[15.5px] top-0 w-px bg-slate-200 dark:bg-white/10" />
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-slate-600 dark:bg-white/5 dark:text-slate-300">
                  <Icon name="timer" className="h-3 w-3" />+{fmtDuration(s.gapMs)}
                </span>
                <span className="truncate text-[10.5px] text-slate-400 dark:text-slate-500">{s.gapLabel}</span>
              </div>
            )}
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full ${nodeCls}`}>
                  {s.current && <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-25" />}
                  <Icon name={EVENT_ICON[s.type] ?? 'activity'} className="h-4 w-4" strokeWidth={2} />
                </span>
                {!last && <span className="w-px flex-1 bg-slate-200 dark:bg-white/10" />}
              </div>
              <div className={`min-w-0 flex-1 ${last ? 'pb-1' : 'pb-3'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-[13px] font-semibold leading-snug ${s.kind === 'pending' ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>{s.title}</p>
                  <StepBadge kind={s.kind} />
                </div>
                <p className="mt-0.5 truncate text-[11.5px] text-slate-500 dark:text-slate-400">{s.site}</p>
                <p className="mt-1 font-mono text-[11.5px] text-slate-700 dark:text-slate-300">
                  {s.ts != null ? fmtDateTime(s.ts) : 'Awaiting slot'}
                  {s.kind === 'pending' && s.ts != null && (
                    <span className={`ml-2 font-sans text-[11px] font-semibold ${delayed ? 'text-[#d03b3b]' : 'text-slate-500 dark:text-slate-400'}`}>
                      {delayed ? `Delayed ${fmtDuration(now - s.ts)}` : `ETA in ${fmtDuration(s.ts - now)}`}
                    </span>
                  )}
                </p>
                {s.note && <p className="mt-1.5 rounded-lg bg-slate-50 px-2 py-1 text-[11.5px] text-slate-600 ring-1 ring-inset ring-slate-200/80 dark:bg-white/[0.03] dark:text-slate-300 dark:ring-white/[0.06]">{s.note}</p>}
                {s.ref && <p className="mt-1 font-mono text-[10.5px] text-slate-400 dark:text-slate-500">{s.ref}</p>}
                {s.current && bale.status !== 'DISPATCHED' && (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">
                    <Icon name="timer" className="h-3.5 w-3.5" />
                    {bale.status === 'IN_TRANSIT' ? 'In transit for' : bale.status === 'RECEIVING' ? 'Waiting at gate for' : bale.status === 'QC_HOLD' ? 'On hold for' : 'Stored for'}{' '}
                    <span className="font-mono">{fmtDuration(now - s.ts, true)}</span>
                  </p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const fiberKind = (b) => (/wool/i.test(b.fiber) ? 'wool' : /silk/i.test(b.fiber) ? 'silk' : 'cotton');
function fineness(b) {
  const m = b.quality.micronaire.toFixed(1);
  const k = fiberKind(b);
  return k === 'wool' ? `${m} µm` : k === 'silk' ? `${m} denier` : `Mic ${m}`;
}
function SpecGrid({ bale }) {
  const q = bale.quality;
  const kind = fiberKind(bale);
  const fibreSpecs =
    kind === 'wool'
      ? [
          { k: 'Fibre diameter', v: `${q.micronaire.toFixed(1)} µm` },
          { k: 'Staple length', v: `${q.stapleMm.toFixed(0)} mm` },
          { k: 'Strength', v: `${q.strengthGtex.toFixed(0)} N/ktex` },
          { k: 'Moisture regain', v: `${q.moisturePct.toFixed(1)} %` },
          { k: 'Vegetable matter', v: `${q.trashPct.toFixed(1)} %` },
        ]
      : kind === 'silk'
        ? [
            { k: 'Fineness', v: `${q.micronaire.toFixed(1)} denier` },
            { k: 'Tenacity', v: `${q.strengthGtex.toFixed(1)} g/den` },
            { k: 'Moisture regain', v: `${q.moisturePct.toFixed(1)} %` },
            { k: 'Defects', v: `${q.trashPct.toFixed(1)} %` },
          ]
        : [
            { k: 'Micronaire', v: q.micronaire.toFixed(1) },
            { k: 'Staple length', v: `${q.stapleMm.toFixed(1)} mm` },
            { k: 'Strength', v: `${q.strengthGtex.toFixed(1)} g/tex` },
            { k: 'Moisture', v: `${q.moisturePct.toFixed(1)} %`, warn: q.moisturePct > 8.5 },
            { k: 'Trash', v: `${q.trashPct.toFixed(1)} %` },
          ];
  const specs = [
    { k: 'Weight', v: `${bale.weightKg} kg`, icon: 'scale' },
    { k: 'Fibre', v: bale.fiber },
    { k: 'Grade', v: GRADE_META[bale.grade]?.label ?? bale.grade, swatch: GRADE_META[bale.grade]?.swatch },
    { k: 'Variety', v: bale.variety },
    { k: 'Lot', v: bale.lot, mono: true },
    ...fibreSpecs,
    { k: 'Origin', v: bale.origin.replace('Ginning Unit ', 'Gin ') },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
      {specs.map((s) => (
        <div key={s.k} className="min-w-0">
          <dt className="text-[10.5px] font-medium text-slate-500 dark:text-slate-400">{s.k}</dt>
          <dd className={`mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] font-semibold ${s.mono ? 'font-mono' : ''} text-slate-800 dark:text-slate-100`}>
            {s.swatch && <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${s.swatch}`} />}
            {s.warn && <Icon name="alert" className="h-3.5 w-3.5 shrink-0 text-[#d03b3b]" />}
            <span className="truncate">{s.v}</span>
            {s.warn && <span className="text-[10px] font-semibold text-[#d03b3b]">above 8.5 % limit</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function rawJson(bale) {
  const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
  const toGrid = (key) => {
    const s = key ? SLOT_BY_KEY.get(key) : null;
    return s ? { bayX: s.bay, shelfY: s.shelf, rowZ: s.row } : null;
  };
  return JSON.stringify(
    {
      baleId: bale.id,
      lotNo: bale.lot,
      variety: bale.variety,
      fiber: bale.fiber,
      grade: bale.grade,
      qualityType: bale.qualityType,
      weightKg: bale.weightKg,
      quality: bale.quality,
      origin: bale.origin,
      status: bale.status,
      grid: toGrid(bale.slot),
      ...(bale.lastSlot ? { lastGrid: toGrid(bale.lastSlot) } : {}),
      ...(bale.destination ? { destination: bale.destination } : {}),
      ...(bale.eta ? { eta: iso(bale.eta) } : {}),
      history: bale.history.map((h) => ({ event: h.type, title: h.title, site: h.site, ts: iso(h.ts), ...(h.note ? { note: h.note } : {}), ...(h.ref ? { ref: h.ref } : {}) })),
    },
    null,
    2
  );
}

function SectionTitle({ children, right }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{children}</h3>
      {right}
    </div>
  );
}

function Fact({ icon, label, children }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/70 px-2.5 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="flex items-center gap-1 text-[10.5px] font-medium text-slate-500 dark:text-slate-400">
        <Icon name={icon} className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 truncate font-mono text-[12.5px] font-semibold text-slate-900 dark:text-white">{children}</div>
    </div>
  );
}

function JourneyContent({ bale, onLocate, hazards = [], onSelectIncident }) {
  const [copied, setCopied] = useState(false);
  const s = bale.slot ? SLOT_BY_KEY.get(bale.slot) : null;
  const whEntry = bale.history.find((h) => h.type === 'WH_IN' || h.type === 'STORED')?.ts ?? null;
  const exitTs = bale.history.find((h) => h.type === 'DISPATCHED')?.ts ?? null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bale.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };
  const transitProgress = (() => {
    if (bale.status !== 'IN_TRANSIT' || !bale.eta) return null;
    const out = bale.history.find((h) => h.type === 'TW_OUT')?.ts;
    return out ? { out, eta: bale.eta } : null;
  })();
  return (
    <div className="animate-[wh-fade-up_.35s_ease-out]">
      <div className="border-b border-slate-200/80 px-4 pb-3 pt-4 dark:border-white/[0.06]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Bale journey</p>
            <div className="mt-0.5 flex items-center gap-2">
              <h2 className="font-mono text-[22px] font-bold tracking-tight text-slate-900 dark:text-white">{bale.id}</h2>
              <button type="button" onClick={copy} aria-label="Copy bale ID" title="Copy bale ID" className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white">
                <Icon name={copied ? 'check' : 'copy'} className="h-3.5 w-3.5" />
              </button>
              {bale.tracked && <Icon name="star" className="h-4 w-4 fill-amber-400 text-amber-400" strokeWidth={1.5} />}
            </div>
            <p className="truncate text-[12px] text-slate-500 dark:text-slate-400">
              {bale.lot} · {bale.variety} · {bale.qualityType}
            </p>
          </div>
          <StatusBadge status={bale.status} />
        </div>
      </div>

      <div className="space-y-5 px-4 py-4">
        <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-50 via-white to-white p-4 dark:from-cyan-400/10 dark:via-slate-900/40 dark:to-slate-900/20">
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-400/20 blur-2xl" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Current location</p>
              {s ? (
                <>
                  <p className="mt-1 font-mono text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
                    {s.bay}
                    <span className="text-slate-300 dark:text-slate-600"> / </span>
                    {s.shelf}
                    <span className="text-slate-300 dark:text-slate-600"> / </span>R{s.row}
                  </p>
                  <p className="text-[11.5px] text-slate-600 dark:text-slate-300">
                    Bay {s.bay} <span className="text-slate-400">(X)</span> · Shelf {s.shelf} <span className="text-slate-400">(Y · level {s.level + 1})</span> · Row R{s.row}{' '}
                    <span className="text-slate-400">(Z)</span>
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">WH 15-1 · {s.blockName}</p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-[18px] font-bold tracking-tight text-slate-900 dark:text-white">
                    {bale.status === 'IN_TRANSIT' ? 'En route to WH 15-1' : bale.status === 'RECEIVING' ? 'Receiving bay · Gate E-1' : 'Left WH 15-1'}
                  </p>
                  <p className="text-[11.5px] text-slate-600 dark:text-slate-300">
                    {bale.status === 'IN_TRANSIT' && 'Transit Warehouse 3 → Warehouse 15-1'}
                    {bale.status === 'RECEIVING' && 'Weighed in · awaiting put-away slot'}
                    {bale.status === 'DISPATCHED' && `To ${bale.destination ?? 'outbound customer'}${bale.lastSlot ? ` · last slot ${bale.lastSlot}` : ''}`}
                  </p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onLocate}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[12px] font-semibold text-white shadow transition hover:bg-slate-700 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300"
            >
              <Icon name="crosshair" className="h-3.5 w-3.5" />
              Locate
            </button>
          </div>
          {transitProgress && <TransitProgress {...transitProgress} />}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Fact icon="scale" label="Weight">
            {bale.weightKg} kg
          </Fact>
          <Fact icon="activity" label={fiberKind(bale) === 'cotton' ? 'Micronaire · grade' : 'Fineness · grade'}>
            {fineness(bale)} · {bale.grade}
          </Fact>
          <Fact icon="pin" label="Assigned rack">
            {s ? `${s.bay} · ${s.shelf} · R${s.row}` : bale.lastSlot ? `ex ${bale.lastSlot}` : '—'}
          </Fact>
          <Fact icon="timer" label="Storage duration">
            {whEntry ? <LiveDuration from={whEntry} to={exitTs} /> : 'Not stored yet'}
          </Fact>
        </div>

        {hazards.length > 0 && (
          <div>
            <SectionTitle right={<span className="text-[10.5px] text-slate-400">{hazards.length} open</span>}>Open hazards on this bale</SectionTitle>
            <ul className="space-y-1.5">
              {hazards.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => onSelectIncident(h.id)}
                    className="relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg border border-slate-200/80 py-2 pl-3.5 pr-2.5 text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.06] dark:hover:bg-white/5"
                  >
                    <span className={`absolute inset-y-0 left-0 w-1 ${SEVERITY[h.severity].stripe}`} />
                    <Icon name={HAZARD_CATS[h.category].icon} className={`h-4 w-4 shrink-0 ${HAZARD_CATS[h.category].fg}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-slate-900 dark:text-white">{h.title}</span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {h.id} · {readingText(h)}
                      </span>
                    </span>
                    <SeverityBadge severity={h.severity} size="xs" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <JourneyMetrics bale={bale} />

        <div>
          <SectionTitle>Movement path</SectionTitle>
          <RouteStrip bale={bale} />
        </div>

        <div>
          <SectionTitle right={<span className="text-[10.5px] text-slate-400">{bale.history.length} events</span>}>Lifecycle timeline</SectionTitle>
          <Timeline bale={bale} />
        </div>

        <div>
          <SectionTitle>Bale specification</SectionTitle>
          <SpecGrid bale={bale} />
        </div>

        <details className="group rounded-xl border border-slate-200/80 dark:border-white/[0.06]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="code" className="h-3.5 w-3.5" /> Raw record (JSON)
            </span>
            <Icon name="arrowDown" className="h-3.5 w-3.5 transition group-open:rotate-180" />
          </summary>
          <pre className="wh-scroll max-h-72 overflow-auto border-t border-slate-200/80 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-slate-600 dark:border-white/[0.06] dark:text-slate-300">{rawJson(bale)}</pre>
        </details>
      </div>
    </div>
  );
}

function TransitProgress({ out, eta }) {
  const now = useNow();
  const k = clamp((now - out) / (eta - out), 0, 1);
  const late = now > eta;
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[10.5px] text-slate-500 dark:text-slate-400">
        <span>Left TW-3 {DTF.time.format(out)}</span>
        <span className={late ? 'font-semibold text-[#d03b3b]' : ''}>{late ? `Delayed ${fmtDuration(now - eta)}` : `ETA ${DTF.time.format(eta)}`}</span>
      </div>
      <div className="relative mt-1 h-1.5 rounded-full bg-[#eda100]/20">
        <div className="h-full rounded-full bg-[#eda100] transition-[width] duration-1000 dark:bg-[#c98500]" style={{ width: `${k * 100}%` }} />
        <span className="absolute top-1/2 grid h-4 w-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#b37900] shadow ring-1 ring-[#eda100]/50 dark:bg-slate-900 dark:text-[#eda100]" style={{ left: `${k * 100}%` }}>
          <Icon name="truck" className="h-2.5 w-2.5" strokeWidth={2.4} />
        </span>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, text }) {
  return (
    <div className="grid h-full min-h-[240px] place-items-center p-8 text-center">
      <div>
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-300">
          <Icon name={icon} className="h-6 w-6" />
        </span>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{text}</p>
      </div>
    </div>
  );
}

const btnBase = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500';
const btnPrimary = `${btnBase} bg-slate-900 text-white hover:bg-slate-700 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300`;
const btnSecondary = `${btnBase} bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-white/10`;
const btnSuccess = `${btnBase} bg-[#0ca30c] text-white hover:bg-[#0a8f0a]`;
const btnDisabled = `${btnBase} cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-500`;

function IncidentCommand({ inc, bale, onAction, onLocate, onOpenBale, onBack }) {
  const now = useNow();
  const done = inc.steps.filter((s) => s.done).length;
  const allDone = done === inc.steps.length;
  const resolved = inc.status === 'RESOLVED';
  const s = inc.sensor;
  const trend = !resolved && s?.ratePerHour ? `+${s.ratePerHour} ${s.unit}/h` : null;
  const zone = inc.zone ? ZONE_BY_ID.get(inc.zone) : null;
  return (
    <div className="animate-[wh-fade-up_.35s_ease-out] space-y-4 px-4 py-4">
      <div>
        <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-700 hover:underline dark:text-cyan-300">
          <Icon name="arrowRight" className="h-3 w-3 rotate-180" />
          Facility overview
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={inc.severity} />
          <CategoryChip cat={inc.category} />
          <IncidentStatusBadge status={inc.status} />
          <span className="ml-auto font-mono text-[11px] text-slate-500 dark:text-slate-400">{inc.id}</span>
        </div>
        <h2 className="mt-2 text-[17px] font-bold leading-snug tracking-tight text-slate-900 dark:text-white">{inc.title}</h2>
        <p className="mt-1 text-[11.5px] text-slate-500 dark:text-slate-400">
          {INCIDENT_TYPES[inc.type]} · detected {fmtDateTime(inc.detectedAt)} ·{' '}
          {resolved ? (
            `resolved after ${fmtDuration(inc.resolvedAt - inc.detectedAt)}`
          ) : (
            <>
              open for <span className="font-mono tabular-nums">{fmtDuration(now - inc.detectedAt, true)}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-cyan-500/30 bg-cyan-50/60 px-3 py-2.5 dark:bg-cyan-400/[0.06]">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Location</p>
          <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">{incidentLocation(inc)}</p>
          {zone && (
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              Zone {zone.id} · {zone.suppression} suppression
            </p>
          )}
        </div>
        <button type="button" onClick={onLocate} className={btnPrimary}>
          <Icon name="crosshair" className="h-3.5 w-3.5" />
          Locate
        </button>
      </div>

      <p className="text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300">{inc.detail}</p>

      {s && (
        <div className="flex items-end justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Icon name="radio" className="h-3.5 w-3.5" />
              Live sensor · {s.kind}
            </p>
            <p className="mt-1 font-mono text-[26px] font-bold leading-none text-slate-900 dark:text-white">{readingText(inc)}</p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {limitText(inc)} · sensor <span className="font-mono">{s.id}</span>
            </p>
          </div>
          {trend && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-900/60 dark:text-slate-200 dark:ring-white/10">
              <Icon name="arrowUp" className={`h-3 w-3 ${SEVERITY.CRITICAL.fg}`} strokeWidth={2.6} />
              {trend}
            </span>
          )}
        </div>
      )}

      {bale && (
        <button type="button" onClick={onOpenBale} className="flex w-full items-center gap-3 rounded-xl border border-slate-200/80 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.06] dark:hover:bg-white/5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300">
            <Icon name="box" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[14px] font-semibold text-slate-900 dark:text-white">{bale.id}</span>
            <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
              {bale.fiber} · Grade {bale.grade} · {bale.weightKg} kg · {bale.slot ?? zoneLabel(bale)}
            </span>
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">Bale details →</span>
        </button>
      )}

      <div>
        <SectionTitle right={<span className="text-[11px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">{done} of {inc.steps.length} done</span>}>Live hazard response checklist</SectionTitle>
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <div className="h-full rounded-full bg-[#0ca30c] transition-[width] duration-500" style={{ width: `${(done / inc.steps.length) * 100}%` }} />
        </div>
        <ol className="space-y-0.5">
          {inc.steps.map((st, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onAction('step', i)}
                disabled={resolved}
                aria-pressed={st.done}
                className="group flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-white/5"
              >
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition ${st.done ? 'border-[#0ca30c] bg-[#0ca30c] text-white' : 'border-slate-300 group-hover:border-cyan-500 dark:border-white/25'}`}>
                  {st.done && <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[12.5px] font-medium leading-snug ${st.done ? 'text-slate-400 line-through decoration-slate-300 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
                    Step {i + 1}: {st.text}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                    <span className="rounded bg-slate-100 px-1.5 py-px font-medium dark:bg-white/5">{st.role}</span>
                    {st.done && (
                      <span>
                        Done {DTF.time.format(st.doneAt)} · {st.by}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap gap-2">
        {inc.status === 'OPEN' && (
          <button type="button" className={btnPrimary} onClick={() => onAction('ack')}>
            <Icon name="eye" className="h-3.5 w-3.5" />
            Acknowledge
          </button>
        )}
        {!resolved && inc.severity !== 'CRITICAL' && (
          <button type="button" className={btnSecondary} onClick={() => onAction('escalate')}>
            <Icon name="arrowUp" className="h-3.5 w-3.5" />
            Escalate
          </button>
        )}
        {!resolved ? (
          <button type="button" className={allDone ? btnSuccess : btnDisabled} disabled={!allDone} onClick={() => onAction('resolve')}>
            <Icon name="check" className="h-3.5 w-3.5" />
            Resolve incident
          </button>
        ) : (
          <button type="button" className={btnSecondary} onClick={() => onAction('reopen')}>
            <Icon name="rotate" className="h-3.5 w-3.5" />
            Re-open
          </button>
        )}
      </div>
      {!resolved && !allDone && (
        <p className="-mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          Complete the remaining {inc.steps.length - done} step{inc.steps.length - done === 1 ? '' : 's'} to resolve.
        </p>
      )}

      <div>
        <SectionTitle right={<span className="text-[10.5px] text-slate-400">{inc.audit.length} entries</span>}>Audit trail</SectionTitle>
        <ol className="relative space-y-2.5 border-l border-slate-200 pl-4 dark:border-white/10">
          {[...inc.audit].reverse().map((a, i) => (
            <li key={`${a.ts}-${i}`} className="relative">
              <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 ${a.actor === ACTOR ? 'bg-cyan-500' : 'bg-slate-400'}`} />
              <p className="text-[12px] leading-snug text-slate-800 dark:text-slate-100">{a.text}</p>
              <p className="font-mono text-[10.5px] text-slate-500 dark:text-slate-400">
                {fmtDateTime(a.ts)} · {a.actor}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function CommandOverview({ risk, onSelectIncident }) {
  const band = healthBand(risk.health.overall);
  return (
    <div className="animate-[wh-fade-up_.35s_ease-out] space-y-4 px-4 py-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Incident command</p>
        <h2 className="mt-0.5 text-[17px] font-bold text-slate-900 dark:text-white">Facility overview</h2>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">Pick an incident to run its response checklist.</p>
      </div>
      <div className="rounded-2xl border border-slate-200/80 p-4 dark:border-white/[0.06]">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Facility health index</p>
            <p className="text-[34px] font-bold leading-none tracking-tight text-slate-900 dark:text-white">
              {Math.round(risk.health.overall)}
              <span className="text-[18px] text-slate-500">%</span>
            </p>
          </div>
          <span className={`${chipBase} ${chipPad()}`}>
            <Icon name={band.icon} className={`h-3.5 w-3.5 ${band.fg}`} strokeWidth={2.4} />
            {band.label}
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {CAT_ORDER.map((c) => {
            const v = risk.health.cats[c];
            return (
              <div key={c} className="flex items-center gap-2 text-[11.5px]">
                <Icon name={HAZARD_CATS[c].icon} className={`h-3.5 w-3.5 shrink-0 ${HAZARD_CATS[c].fg}`} />
                <span className="w-[104px] truncate text-slate-600 dark:text-slate-300">{HAZARD_CATS[c].label}</span>
                <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-white/10">
                  <div className={`h-full rounded-full transition-[width] duration-500 ${healthBand(v).fill}`} style={{ width: `${v}%` }} />
                </div>
                <span className="w-8 text-right font-mono text-slate-700 dark:text-slate-200">{Math.round(v)}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[10.5px] leading-relaxed text-slate-500 dark:text-slate-400">
          Each category starts at 100 and loses 10 / 3 / 0.5 points per open critical / warning / info incident (60 % once acknowledged). Weights: fire 35 %, security 25 %, stacks 25 %, pests 15 %.
        </p>
      </div>
      <div>
        <SectionTitle right={<span className="text-[10.5px] text-slate-400">{risk.open.length} open</span>}>Priority queue</SectionTitle>
        {risk.open.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-[12px] text-slate-500 dark:border-white/10">All clear — no open incidents.</p>
        ) : (
          <ul className="space-y-1.5">
            {risk.open.slice(0, 8).map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => onSelectIncident(i.id)}
                  className="relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg border border-slate-200/80 py-2 pl-3.5 pr-2.5 text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.06] dark:hover:bg-white/5"
                >
                  <span className={`absolute inset-y-0 left-0 w-1 ${SEVERITY[i.severity].stripe}`} />
                  <Icon name={HAZARD_CATS[i.category].icon} className={`h-4 w-4 shrink-0 ${HAZARD_CATS[i.category].fg}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-slate-900 dark:text-white">{i.title}</span>
                    <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {i.id} · {incidentLocation(i)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10.5px] text-slate-500 dark:text-slate-400">
                    <TimeAgo ts={i.detectedAt} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Single-series 24 h line chart with threshold lines and a hover read-out. */
function MetricChart({ title, icon, unit, points, digits = 1, warn, crit, low, lowSev = 'WARNING', domain, sensorId }) {
  const [hover, setHover] = useState(null);
  const W = 320;
  const H = 116;
  const L = 30;
  const R = 6;
  const T = 8;
  const B = 18;
  const vals = points.filter((p) => p.v != null).map((p) => p.v);
  const refs = [warn, crit, low].filter((v) => v != null);
  let lo = domain ? domain[0] : Math.min(...vals, ...refs);
  let hi = domain ? domain[1] : Math.max(...vals, ...refs);
  if (!domain) {
    const pad = (hi - lo) * 0.12 || 1;
    lo -= pad;
    hi += pad;
  }
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const X = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const Y = (v) => T + (1 - (clamp(v, lo, hi) - lo) / (hi - lo)) * (H - T - B);
  let d = '';
  let pen = false;
  let gapStart = null;
  const gaps = [];
  for (const p of points) {
    if (p.v == null) {
      if (gapStart == null) gapStart = p.t;
      pen = false;
      continue;
    }
    if (gapStart != null) {
      gaps.push([gapStart, p.t]);
      gapStart = null;
    }
    d += `${pen ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`;
    pen = true;
  }
  if (gapStart != null) gaps.push([gapStart, t1]);
  const last = points[points.length - 1];
  const cur = last.v;
  let status;
  if (cur == null) status = { label: 'No signal', sev: 'CRITICAL' };
  else if (crit != null && cur >= crit) status = { label: 'Critical', sev: 'CRITICAL' };
  else if (warn != null && cur >= warn) status = { label: 'Warning', sev: 'WARNING' };
  else if (low != null && cur < low) status = { label: SEVERITY[lowSev].label, sev: lowSev };
  else status = { label: 'Normal', sev: null };
  const fmtV = (v) => (v == null ? 'no signal' : `${v.toFixed(digits)} ${unit}`);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((((e.clientX - r.left) / r.width) * W - L) / (W - L - R)) * (t1 - t0);
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const dd = Math.abs(p.t - t);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    setHover(best);
  };
  const hp = hover != null ? points[hover] : null;
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <div className="rounded-xl border border-slate-200/80 p-3 dark:border-white/[0.06]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-800 dark:text-slate-100">
            <Icon name={icon} className="h-3.5 w-3.5 text-slate-400" />
            {title}
          </p>
          <p className="font-mono text-[10px] text-slate-400">{sensorId}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[15px] font-semibold text-slate-900 dark:text-white">{cur == null ? '—' : fmtV(cur)}</p>
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
            <Icon name={status.sev ? SEVERITY[status.sev].icon : 'check'} className={`h-3 w-3 ${status.sev ? SEVERITY[status.sev].fg : 'text-[#0a8f0a] dark:text-[#3fcf3f]'}`} strokeWidth={2.4} />
            {status.label}
          </span>
        </div>
      </div>
      <div className="relative mt-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`${title}, last 24 hours, now ${fmtV(cur)}`}>
          {ticks.map((v, i) => (
            <g key={i}>
              <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="stroke-slate-200 dark:stroke-white/[0.07]" strokeWidth="1" />
              <text x={L - 4} y={Y(v) + 3} textAnchor="end" className="fill-slate-400 text-[9px]">
                {v.toFixed(hi - lo < 10 ? 1 : 0)}
              </text>
            </g>
          ))}
          {gaps.map(([a, b], i) => (
            <rect key={i} x={X(a)} y={T} width={Math.max(1, X(b) - X(a))} height={H - T - B} className="fill-[#d03b3b]/10" />
          ))}
          {[
            [warn, 'Warn'],
            [crit, 'Critical'],
            [low, 'Min'],
          ]
            .filter(([v]) => v != null)
            .map(([v, k]) => (
              <g key={k}>
                <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} strokeDasharray="4 3" strokeWidth="1.25" className={k === 'Critical' || (k === 'Min' && lowSev === 'CRITICAL') ? 'stroke-[#d03b3b]' : 'stroke-[#fab219]'} />
                <text x={W - R} y={Y(v) - 3} textAnchor="end" className="fill-slate-500 text-[9px] dark:fill-slate-400">
                  {k} {v}
                </text>
              </g>
            ))}
          <path d={d} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="stroke-[#2a78d6] dark:stroke-[#3987e5]" />
          {cur != null && <circle cx={X(last.t)} cy={Y(cur)} r="3.5" strokeWidth="2" className="fill-[#2a78d6] stroke-white dark:fill-[#3987e5] dark:stroke-slate-900" />}
          {hp && (
            <>
              <line x1={X(hp.t)} x2={X(hp.t)} y1={T} y2={H - B} strokeDasharray="2 2" className="stroke-slate-400" />
              {hp.v != null && <circle cx={X(hp.t)} cy={Y(hp.v)} r="3.5" strokeWidth="2" className="fill-slate-600 stroke-white dark:fill-slate-200 dark:stroke-slate-900" />}
            </>
          )}
          <text x={L} y={H - 4} className="fill-slate-400 text-[9px]">
            −24 h
          </text>
          <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" className="fill-slate-400 text-[9px]">
            −12 h
          </text>
          <text x={W - R} y={H - 4} textAnchor="end" className="fill-slate-400 text-[9px]">
            now
          </text>
        </svg>
        {hp && (
          <div className="pointer-events-none absolute left-8 top-0 rounded-md bg-slate-900 px-2 py-1 text-[10.5px] font-medium text-white shadow dark:bg-slate-100 dark:text-slate-900">
            {fmtShort(hp.t)} · {fmtV(hp.v)}
          </div>
        )}
      </div>
    </div>
  );
}

function SensorLog({ bale, incident, incidents }) {
  const now = useNow();
  const incidentMode = !!incident && !incident.baleId;
  const slot = !incidentMode && bale?.slot && SLOT_STATUSES.has(bale.status) ? SLOT_BY_KEY.get(bale.slot) : null;
  const charts = useMemo(() => {
    if (incidentMode) {
      const s = incident.sensor;
      if (s?.metric === 'rh') {
        return [{ key: 'rh', title: `Relative humidity · zone ${incident.zone}`, icon: 'droplet', unit: '%', digits: 0, points: sensorSeries('rh', `zone:${incident.zone}`, now, { base: 62, inc: incident }), warn: TH.rhHigh.warn, low: TH.rhLow.warn, sensorId: s.id }];
      }
      if (s?.metric === 'tilt' && incident.target?.column) {
        const c = incident.target.column;
        return [{ key: 'tilt', title: `Stack tilt · L-${c.lane}/R${c.row}`, icon: 'stack', unit: '°', points: sensorSeries('tilt', `${c.lane}:${c.row}`, now, { base: 0.8, inc: incident }), warn: TH.tilt.warn, crit: TH.tilt.crit, domain: [0, 6], sensorId: s.id }];
      }
      return [];
    }
    if (!slot) return [];
    const zone = zoneIdOfSlot(slot);
    const latest = (pred) => incidents.filter(pred).sort((a, b) => b.detectedAt - a.detectedAt)[0];
    const thermal = latest((i) => i.type === 'THERMAL' && i.baleId === bale.id);
    const rh = latest((i) => (i.type === 'RH_HIGH' || i.type === 'RH_LOW') && i.zone === zone);
    const tilt = latest((i) => i.type === 'TILT' && i.target?.column?.lane === slot.lane && i.target.column.row === slot.row);
    const rfid = latest((i) => i.type === 'RFID_LOST' && i.baleId === bale.id);
    const strap = latest((i) => i.type === 'STRAP_SNAP' && i.baleId === bale.id);
    return [
      { key: 'temp', label: 'Core', title: 'Core temperature', icon: 'thermo', unit: '°C', points: sensorSeries('coreTemp', bale.id, now, { inc: thermal }), warn: TH.coreTemp.warn, crit: TH.coreTemp.crit, sensorId: thermal?.sensor.id ?? `TC-${pad2(slot.lane)}-${slot.shelf}` },
      { key: 'rh', label: 'RH', title: `Relative humidity · zone ${zone}`, icon: 'droplet', unit: '%', digits: 0, points: sensorSeries('rh', `zone:${zone}`, now, { base: rh ? 62 : ZONE_BY_ID.get(zone)?.rh, inc: rh }), warn: TH.rhHigh.warn, low: TH.rhLow.warn, sensorId: rh?.sensor.id ?? `RH-${zone}` },
      { key: 'tilt', label: 'Tilt', title: `Stack tilt · L-${slot.lane}/R${slot.row}`, icon: 'stack', unit: '°', points: sensorSeries('tilt', `${slot.lane}:${slot.row}`, now, { inc: tilt, base: tilt ? 0.8 : undefined }), warn: TH.tilt.warn, crit: TH.tilt.crit, domain: [0, 6], sensorId: `GY-${pad2(slot.lane)}-${pad2(slot.row)}` },
      { key: 'rssi', label: 'RSSI', title: 'RFID / BLE tag signal', icon: 'radio', unit: 'dBm', digits: 0, points: sensorSeries('rssi', bale.id, now, { inc: rfid }), low: TH.rssiLost, lowSev: 'CRITICAL', domain: [-100, -40], sensorId: `TAG-${bale.id.slice(-6)}` },
      { key: 'tension', label: 'Strap', title: 'Strap tension · strap #2', icon: 'activity', unit: 'kN', points: sensorSeries('tension', bale.id, now, { inc: strap }), low: TH.strapTension.min, lowSev: 'CRITICAL', domain: [0, 5], sensorId: strap?.sensor.id ?? `SG-${slot.lane}-${slot.shelf}${slot.row}-2` },
    ];
  }, [now, bale, slot, incident, incidents, incidentMode]);

  const log = useMemo(() => {
    const rows = [];
    const subject = incidentMode
      ? [incident]
      : bale
        ? incidents.filter((i) => i.baleId === bale.id || (slot && i.target?.column?.lane === slot.lane && i.target.column.row === slot.row))
        : [];
    if (!incidentMode && bale) bale.history.forEach((h) => rows.push({ ts: h.ts, icon: EVENT_ICON[h.type] ?? 'activity', iconCls: 'text-slate-400', text: h.title, sub: h.site, kind: 'Movement' }));
    subject.forEach((inc) => inc.audit.forEach((a) => rows.push({ ts: a.ts, icon: HAZARD_CATS[inc.category].icon, iconCls: HAZARD_CATS[inc.category].fg, text: a.text, sub: `${inc.id} · ${a.actor}`, kind: 'Incident' })));
    if (charts.length) {
      const grid = charts[0].points;
      for (let i = grid.length - 2; i >= 0; i -= 6) {
        const text = charts
          .map((c) => {
            const v = c.points[i]?.v;
            return `${c.label ?? c.title.split(' ·')[0]} ${v == null ? '—' : `${v.toFixed(c.digits ?? 1)}${c.unit === '%' ? '%' : ` ${c.unit}`}`}`;
          })
          .join(' · ');
        rows.push({ ts: grid[i].t, icon: 'radio', iconCls: 'text-[#2a78d6] dark:text-[#6da7ec]', text, sub: 'scheduled read', kind: 'Telemetry' });
      }
    }
    return rows.sort((a, b) => b.ts - a.ts).slice(0, 40);
  }, [charts, bale, incident, incidents, slot, incidentMode]);

  const subject = incidentMode ? `${incident.id} · ${incidentLocation(incident)}` : bale ? `Bale ${bale.id}${slot ? ` · ${slot.key}` : ''}` : null;
  if (!subject) return <EmptyState icon="activity" title="Nothing selected" text="Select a bale or an incident to see its sensor history." />;
  return (
    <div className="animate-[wh-fade-up_.35s_ease-out] space-y-4 px-4 py-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Historical sensor log</p>
        <h2 className="mt-0.5 truncate font-mono text-[15px] font-bold text-slate-900 dark:text-white">{subject}</h2>
        <p className="text-[11.5px] text-slate-500 dark:text-slate-400">Last 24 h at 30-minute resolution; the end point is live.</p>
      </div>
      {charts.length ? (
        <div className="space-y-2.5">
          {charts.map((c) => (
            <MetricChart key={c.key} {...c} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 p-3 text-[12px] text-slate-500 dark:border-white/10 dark:text-slate-400">
          {bale && !incidentMode ? 'This bale is not in a rack slot, so rack sensors do not apply.' : 'This incident has no continuous sensor trace — see the event log below.'}
        </p>
      )}
      <div>
        <SectionTitle right={<span className="text-[10.5px] text-slate-400">{log.length} entries</span>}>Time-stamped telemetry &amp; movement log</SectionTitle>
        <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 dark:divide-white/[0.05] dark:border-white/[0.06]">
          {log.map((r, i) => (
            <li key={`${r.ts}-${i}`} className="flex gap-2.5 px-3 py-2">
              <Icon name={r.icon} className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${r.iconCls}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] leading-snug text-slate-800 dark:text-slate-100">{r.text}</p>
                <p className="truncate text-[10.5px] text-slate-500 dark:text-slate-400">
                  {r.kind} · {r.sub}
                </p>
              </div>
              <span className="shrink-0 text-right font-mono text-[10px] leading-tight text-slate-400">
                {DTF.dayMon.format(r.ts)}
                <br />
                {DTF.time.format(r.ts)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

const RIGHT_TABS = [
  { key: 'command', label: 'Command', icon: 'siren' },
  { key: 'bale', label: 'Bale journey', icon: 'box' },
  { key: 'sensors', label: 'Sensors', icon: 'activity' },
];
function CommandPanel({ className, tab, setTab, onClose, incident, incidentBale, bale, risk, incidents, onAction, onLocateIncident, onLocateBale, onSelectIncident, onClearIncident, onOpenBale }) {
  return (
    <section className={`flex min-h-0 flex-col ${panelCls} ${className}`} aria-label="Incident command and audit trail">
      <div className="flex shrink-0 items-end border-b border-slate-200/80 dark:border-white/[0.06]">
      <div role="tablist" aria-label="Command panel" className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto px-2 pt-2">
        {RIGHT_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`relative -mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-2 text-[12px] font-semibold transition ${
                active ? 'border-cyan-500 text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Icon name={t.icon} className="h-3.5 w-3.5" />
              {t.label}
              {t.key === 'command' && incident && <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY[incident.severity].stripe}`} />}
            </button>
          );
        })}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close details panel"
          className="mb-1.5 mr-2 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      )}
      </div>
      <div className="wh-scroll min-h-0 flex-1 overflow-y-auto">
        {tab === 'command' &&
          (incident ? (
            <IncidentCommand key={incident.id} inc={incident} bale={incidentBale} onAction={(op, step) => onAction(incident.id, op, step)} onLocate={onLocateIncident} onOpenBale={onOpenBale} onBack={onClearIncident} />
          ) : (
            <CommandOverview risk={risk} onSelectIncident={onSelectIncident} />
          ))}
        {tab === 'bale' &&
          (bale ? (
            <JourneyContent key={bale.id} bale={bale} onLocate={onLocateBale} hazards={risk.byBale.get(bale.id) ?? []} onSelectIncident={onSelectIncident} />
          ) : (
            <EmptyState icon="route" title="No bale selected" text="Search the inventory or click a bale in the 3D view to see its journey." />
          ))}
        {tab === 'sensors' && <SensorLog bale={bale} incident={incident} incidents={incidents} />}
      </div>
    </section>
  );
}

/* ---------------- Root ---------------- */
export default function WarehouseDashboard() {
  const [state, dispatch] = useReducer(reducer, undefined, initState);
  const [theme, setTheme] = useThemePreference();
  const [selectedId, setSelectedId] = useState(DEFAULT_SELECTED_ID);
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [focus, setFocus] = useState({ nonce: 0, incident: null });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [leftTab, setLeftTab] = useState('ALL');
  const [rightTab, setRightTab] = useState('command');
  // Details (incident command / bale journey / sensor log) open over the 3D view on demand.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [preset, setPreset] = useState('iso');
  const [viewMode, setViewMode] = useState('normal');
  const [heatField, setHeatField] = useState('thermal');
  const [overlaysOn, setOverlaysOn] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [colorMode, setColorMode] = useState('status');
  const [shelves, setShelves] = useState(SHELVES);
  const [live, setLive] = useState(true);
  const viewportRef = useRef(null);
  const searchRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const stats = useMemo(() => deriveStats(state.bales), [state.bales]);
  const risk = useMemo(() => deriveRisk(state.incidents), [state.incidents]);
  const riskRef = useRef(risk);
  riskRef.current = risk;
  const incidentsById = useMemo(() => new Map(state.incidents.map((i) => [i.id, i])), [state.incidents]);
  const counts = useMemo(() => ({ ...stats.counts, AT_RISK: risk.byBale.size }), [stats.counts, risk.byBale]);
  const selectedBale = stats.byId.get(selectedId) ?? null;
  const selectedIncident = selectedIncidentId ? incidentsById.get(selectedIncidentId) ?? null : null;
  const incidentBale = selectedIncident?.baleId ? stats.byId.get(selectedIncident.baleId) ?? null : null;
  // An incident without a bale (zone, trap, beam…) hides the bale pin so the 3D focus is unambiguous.
  const engineBale = selectedIncident && !selectedIncident.baleId ? null : selectedBale;

  const hazardScene = useMemo(
    () => ({
      incidents: risk.open,
      traps: risk.traps,
      beams: risk.beams,
      zones: risk.zones,
      tilt: risk.tilt,
      ghost: risk.ghost,
      blockedLanes: risk.blockedLanes,
      heat: risk.heat,
      cats: new Set(HAZARD_CATS[leftTab] ? [leftTab] : CAT_ORDER),
      selectedIncidentId,
    }),
    [risk, leftTab, selectedIncidentId]
  );

  const sceneData = useMemo(
    () => ({
      occupancy: stats.occupancy,
      byId: stats.byId,
      colorMode,
      shelves: new Set(shelves),
      receivingIds: stats.receivingIds,
      inTransit: stats.counts.IN_TRANSIT,
      dispatched24h: stats.dispatched24h,
      now: Date.now(),
    }),
    [stats, colorMode, shelves]
  );

  const selectBale = useCallback((id, fly = true) => {
    setSelectedId(id);
    setSelectedIncidentId(riskRef.current.byBale.get(id)?.[0]?.id ?? null);
    setRightTab((t) => (t === 'sensors' ? t : 'bale'));
    setDetailsOpen(true);
    if (fly) {
      setFocus((f) => ({ nonce: f.nonce + 1, incident: null }));
      setPreset(null);
    }
  }, []);

  const selectIncident = useCallback((id, fly = true) => {
    const inc = stateRef.current.incidents.find((i) => i.id === id);
    if (!inc) return;
    setSelectedIncidentId(id);
    if (inc.baleId) setSelectedId(inc.baleId);
    setRightTab('command');
    setDetailsOpen(true);
    if (fly) {
      setFocus((f) => ({ nonce: f.nonce + 1, incident: inc }));
      setPreset(null);
    }
  }, []);

  const onIncidentAction = useCallback((id, op, step) => dispatch({ type: 'INCIDENT', id, op, step, ts: Date.now() }), []);

  const onTrap = useCallback(
    (t) => {
      if (t.incident) selectIncident(t.incident);
      else viewportRef.current?.focusIncident({ target: { trap: t.id } });
    },
    [selectIncident]
  );

  const applyPreset = useCallback((name) => {
    setPreset(name);
    setViewMode(name === 'heatmap' || name === 'evac' ? name : 'normal');
    viewportRef.current?.setPreset(name);
  }, []);

  const handlePick = useCallback(
    (hit) => {
      if (!hit) return;
      if (hit.kind === 'incident') selectIncident(hit.incidentId);
      else if (hit.kind === 'lane') {
        setLeftTab('ALL');
        setFilter('ALL');
        setQuery(`L-${hit.lane}`);
      } else if (hit.kind === 'trap') {
        const t = riskRef.current.traps.find((x) => x.id === hit.trapId);
        if (t?.incident) selectIncident(t.incident);
        else setLeftTab('PEST');
      } else if (hit.kind === 'bale' && hit.baleId) selectBale(hit.baleId);
      else if (hit.kind === 'truck') {
        const status = hit.which === 'inbound' ? 'IN_TRANSIT' : 'DISPATCHED';
        setFilter(status);
        setQuery('');
        const candidates = stateRef.current.bales.filter((b) => b.status === status).sort((a, b) => Number(b.tracked) - Number(a.tracked) || lastTs(b) - lastTs(a));
        setLeftTab('ALL');
        if (candidates[0]) selectBale(candidates[0].id);
      }
    },
    [selectBale, selectIncident]
  );

  const toggleShelf = useCallback((sh) => {
    setShelves((cur) => {
      if (cur.includes(sh)) return cur.length > 1 ? cur.filter((x) => x !== sh) : cur;
      return SHELVES.filter((x) => x === sh || cur.includes(x));
    });
  }, []);

  useEffect(() => {
    viewportRef.current?.setAutoRotate(autoRotate);
  }, [autoRotate]);

  // Live event stream: every 4.5–8 s a generated bale arrives, is put away or is dispatched.
  useEffect(() => {
    if (!live) return undefined;
    let timer;
    const schedule = () => {
      timer = setTimeout(() => {
        const ev = planSimEvent(stateRef.current.bales, Date.now());
        if (ev) dispatch({ type: 'SIM_EVENT', event: ev });
        schedule();
      }, 4500 + Math.random() * 3500);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [live]);

  // Live sensor telemetry: every 2 s readings drift and new hazards may appear.
  useEffect(() => {
    if (!live) return undefined;
    let ticks = 0;
    const id = setInterval(() => {
      ticks += 1;
      const s = stateRef.current;
      const now = Date.now();
      const { updates, newIncident } = planTelemetryTick(s.incidents, s.bales, now, 2);
      dispatch({ type: 'TELEMETRY', updates, newIncident, ts: now, pushHealth: ticks % 5 === 0 });
    }, 2000);
    return () => clearInterval(id);
  }, [live]);

  useEffect(() => {
    if (state.lastEvent) viewportRef.current?.handleEvent(state.lastEvent);
  }, [state.lastEvent]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') setDetailsOpen(false);
      else if (e.key === '1') applyPreset('top');
      else if (e.key === '2') applyPreset('iso');
      else if (e.key === '3') applyPreset('aisle');
      else if (e.key === '4') applyPreset('heatmap');
      else if (e.key === '5') applyPreset('evac');
      else if (e.key === 'f' || e.key === 'F') viewportRef.current?.focusSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyPreset]);

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <style>{CSS}</style>
      <div className="relative flex min-h-screen flex-col bg-[#eef2f7] font-sans text-slate-900 antialiased xl:h-screen xl:overflow-hidden dark:bg-[#060a13] dark:text-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_-10%,rgba(34,211,238,0.10),transparent_70%)] dark:bg-[radial-gradient(ellipse_70%_45%_at_50%_-10%,rgba(34,211,238,0.14),transparent_70%)]" />
        <TopBar
          stats={stats}
          risk={risk}
          baseline={state.baseline}
          healthHistory={state.healthHistory}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          live={live}
          onToggleLive={() => setLive((v) => !v)}
          onKpi={setLeftTab}
          activeTab={leftTab}
        />
        <main className="relative grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[272px_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)] 2xl:grid-cols-[296px_minmax(0,1fr)]">
          {leftTab === 'ALL' ? (
            <InventoryPanel
              className="order-2 h-[600px] lg:order-1 lg:h-[720px] xl:h-auto"
              tabs={<FeedTabs tab={leftTab} setTab={setLeftTab} risk={risk} />}
              hazardsByBale={risk.byBale}
              bales={state.bales}
              counts={counts}
              selectedId={selectedId}
              onSelect={selectBale}
              searchRef={searchRef}
              query={query}
              setQuery={setQuery}
              filter={filter}
              setFilter={setFilter}
            />
          ) : (
            <IncidentFeed
              className="order-2 h-[600px] lg:order-1 lg:h-[720px] xl:h-auto"
              tabs={<FeedTabs tab={leftTab} setTab={setLeftTab} risk={risk} />}
              cat={leftTab}
              incidents={state.incidents}
              risk={risk}
              query={query}
              setQuery={setQuery}
              searchRef={searchRef}
              selectedIncidentId={selectedIncidentId}
              onSelectIncident={selectIncident}
              onTrap={onTrap}
            />
          )}
          <ViewportPanel
            className="order-1 h-[62vh] min-h-[440px] lg:order-2 lg:h-[720px] xl:h-auto"
            viewportRef={viewportRef}
            theme={theme}
            sceneData={sceneData}
            hazards={hazardScene}
            viewMode={viewMode}
            heatField={heatField}
            setHeatField={setHeatField}
            overlaysOn={overlaysOn}
            setOverlaysOn={setOverlaysOn}
            selectedBale={engineBale}
            focus={focus}
            onSelectIncident={selectIncident}
            risk={risk}
            incidentsById={incidentsById}
            onPick={handlePick}
            preset={preset}
            onPreset={applyPreset}
            onUserCamera={() => setPreset(null)}
            autoRotate={autoRotate}
            setAutoRotate={setAutoRotate}
            colorMode={colorMode}
            setColorMode={setColorMode}
            shelves={shelves}
            toggleShelf={toggleShelf}
            feed={state.feed}
            onSelect={selectBale}
            byId={stats.byId}
            stats={stats}
            detailsOpen={detailsOpen}
            onToggleDetails={() => setDetailsOpen((v) => !v)}
            details={
              <CommandPanel
                className="h-full shadow-2xl shadow-slate-900/15 dark:shadow-black/50"
                tab={rightTab}
                setTab={setRightTab}
                onClose={() => setDetailsOpen(false)}
                incident={selectedIncident}
                incidentBale={incidentBale}
                bale={selectedBale}
                risk={risk}
                incidents={state.incidents}
                onAction={onIncidentAction}
                onLocateIncident={() => selectedIncident && selectIncident(selectedIncident.id)}
                onLocateBale={() => selectBale(selectedId)}
                onSelectIncident={selectIncident}
                onClearIncident={() => setSelectedIncidentId(null)}
                onOpenBale={() => {
                  if (!incidentBale) return;
                  setSelectedId(incidentBale.id);
                  setRightTab('bale');
                }}
              />
            }
          />
        </main>
      </div>
    </div>
  );
}
