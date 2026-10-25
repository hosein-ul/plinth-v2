// callouts: rings are placed in page css px (1280x720 viewport) under the camera state z; chips in screen px
const Z = { vault: [1.3, 760, 540], over: [1.3, 770, 300], det: [1.45, 742, 400], set1: [1.35, 742, 330], set2: [1.4, 640, 470], addr: [1.6, 930, 250] };
callouts.push(
  { beat: 'vault0', t: 4.6, dur: 1.6, z: Z.vault, ring: [312, 436, 130, 52], text: 'Vault balance: 0.00', sx: 360, sy: 536 },
  { beat: 'vault0', t: 5.75, dur: 1.5, z: Z.vault, ring: [910, 464, 305, 28], text: 'One owner wallet', sx: 820, sy: 640 },
  { beat: 'vault0', t: 6.9, dur: 2.0, z: Z.vault, ring: [915, 660, 300, 26], text: 'No admin role for the gateway', sx: 760, sy: 880 },
  { beat: 'addr', t: 2.4, dur: 2.2, z: Z.addr, ring: [713, 305, 430, 150], text: 'Unique to this one order', sx: 150, sy: 760 },
  { beat: 'over', t: 7.5, dur: 1.9, z: Z.over, ring: [1128, 152, 90, 28], text: 'Received: 25.00', sx: 1330, sy: 150 },
  { beat: 'over', t: 9.2, dur: 1.5, z: Z.over, ring: [1140, 314, 76, 28], text: 'Platform fee: 0.05', sx: 1280, sy: 556 },
  { beat: 'over', t: 10.6, dur: 3.0, z: Z.over, ring: [326, 204, 190, 56], text: '24.95 delivered to your vault', sx: 100, sy: 500, big: true },
  { beat: 'detail', t: 6.0, dur: 2.0, z: Z.det, ring: [322, 366, 845, 76], text: 'Detected, Verified, Final, Swept, In vault', sx: 520, sy: 385 },
  { beat: 'settle', t: 1.9, dur: 1.5, z: Z.set1, ring: [868, 318, 92, 22], text: 'Network fee paid by the relayer', sx: 700, sy: 600 },
  { beat: 'settle', t: 3.3, dur: 1.5, z: Z.set1, ring: [985, 320, 60, 20], text: 'Paid to: your vault', sx: 1150, sy: 600 },
  { beat: 'settle', t: 8.7, dur: 2.4, z: Z.set2, ring: [318, 445, 118, 35], text: '24.95 USDC in the vault', sx: 580, sy: 505, big: true },
  { beat: 'pays', t: 1.4, dur: 2.2, ring: [305, 268, 935, 50], text: 'Created by the API, waiting for payment', sx: 560, sy: 620 },
);
