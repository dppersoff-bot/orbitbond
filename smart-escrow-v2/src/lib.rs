// Généré avec l'aide de Claude (Anthropic) — assistant de code IA, hackathon IXH26. Relu et testé par l'équipe Nexora.
//! OrbitBond V2 — Smart Escrow (XLS-100).
//!
//! La caution d'un satellite ne peut être libérée vers l'opérateur que si
//! AU MOINS 2 ORACLES SUR 3 ont certifié la rentrée atmosphérique, en émettant
//! un Credential « DEORBITED » au nom de l'opérateur.
//! Les 3 comptes oracles sont inscrits dans le champ `Data` de l'escrow (3 × 20 octets).
//! La date limite reste portée par `CancelAfter` : passé ce délai, l'escrow ne peut
//! plus qu'être annulé et la caution revient au Fonds (créateur de l'escrow).
#![cfg_attr(target_arch = "wasm32", no_std)]

#[cfg(not(target_arch = "wasm32"))]
extern crate std;

use xrpl_common_stdlib::host::trace::trace_num;
use xrpl_common_stdlib::host::{Result::Err, Result::Ok};
use xrpl_common_stdlib::ledger_entry_ids::credential_id;
use xrpl_common_stdlib::objects::cache_le;
use xrpl_common_stdlib::types::account_id::AccountID;
use xrpl_escrow_stdlib::ledger_objects::traits::CurrentEscrowFields;
use xrpl_escrow_stdlib::{EscrowFinishContext, FinishResult};
use xrpl_macros::smart_escrow;

const CREDENTIAL_TYPE: &[u8] = b"DEORBITED";
const ORACLES: usize = 3;
const THRESHOLD: i64 = 2;

#[smart_escrow]
fn orbitbond_finish(ctx: EscrowFinishContext) -> FinishResult {
    // L'opérateur du satellite = destination de l'escrow
    let operator = match ctx.escrow().get_destination() {
        Ok(account) => account,
        Err(e) => return e.code().into(),
    };

    // Les 3 oracles autorisés, inscrits dans le champ Data à la création
    let data = match ctx.escrow().get_data() {
        Ok(d) => d,
        Err(e) => return e.code().into(),
    };
    let bytes = data.as_slice();
    if bytes.len() < ORACLES * 20 {
        trace_num("Data trop court", bytes.len() as i64);
        return FinishResult::reject();
    }

    // Compte les oracles qui ont émis le Credential DEORBITED pour cet opérateur
    let mut confirmations: i64 = 0;
    for i in 0..ORACLES {
        let mut raw = [0u8; 20];
        raw.copy_from_slice(&bytes[i * 20..(i + 1) * 20]);
        let oracle = AccountID(raw);
        if let Ok(id) = credential_id(&operator, &oracle, CREDENTIAL_TYPE) {
            if let Ok(_) = cache_le(&id) {
                confirmations += 1;
            }
        }
    }
    trace_num("Confirmations d'oracles", confirmations);

    if confirmations >= THRESHOLD {
        FinishResult::succeed()
    } else {
        FinishResult::reject()
    }
}
