use schemars::schema_for;
use serde_json::json;
use taff_contract::{TaskCriteriaReorder, TaskCriterion, TaskCriterionEdit, TaskCriterionInput};

fn main() -> Result<(), serde_json::Error> {
    let schemas = json!({
        "criterion": schema_for!(TaskCriterion),
        "list": schema_for!(Vec<TaskCriterion>),
        "input": schema_for!(TaskCriterionInput),
        "edit": schema_for!(TaskCriterionEdit),
        "reorder": schema_for!(TaskCriteriaReorder),
    });
    println!("{}", serde_json::to_string_pretty(&schemas)?);
    Ok(())
}
