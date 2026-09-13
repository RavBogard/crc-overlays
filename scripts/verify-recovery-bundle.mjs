import {verifyRecoveryBundle} from './recovery-bundle.mjs';
if(!process.argv[2])throw new Error('Pass a recovery bundle directory.');const {manifest}=await verifyRecoveryBundle(process.argv[2]);console.log(`Verified ${manifest.contents.length} recovery files for ${manifest.workspaceId}.`);
