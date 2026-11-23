use schemars::schema_for;
use serde_json::json;
use taff_contract::{ProjectPhase, ProjectPhaseEdit, ProjectPhaseInput};

fn main() -> Result<(), serde_json::Error> {
    let schemas = json!({
        "phase": schema_for!(ProjectPhase),
        "list": schema_for!(Vec<ProjectPhase>),
        "input": schema_for!(ProjectPhaseInput),
        "edit": schema_for!(ProjectPhaseEdit),
    });
    println!("{}", serde_json::to_string_pretty(&schemas)?);
    Ok(())
}
