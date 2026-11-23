use schemars::schema_for;
use taff_contract::AgentCost;

fn main() -> Result<(), serde_json::Error> {
    println!("{}", serde_json::to_string_pretty(&schema_for!(AgentCost))?);
    Ok(())
}
