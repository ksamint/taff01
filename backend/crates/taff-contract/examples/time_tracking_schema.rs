use schemars::schema_for;
use serde_json::json;
use taff_contract::{
    MemberRate, MemberRateInput, TimeEntries, TimeEntry, TimeEntryEdit, TimeEntryInput,
};

fn main() -> Result<(), serde_json::Error> {
    let schemas = json!({
        "entry": schema_for!(TimeEntry),
        "list": schema_for!(TimeEntries),
        "input": schema_for!(TimeEntryInput),
        "edit": schema_for!(TimeEntryEdit),
        "rate": schema_for!(MemberRate),
        "rates": schema_for!(Vec<MemberRate>),
        "rateInput": schema_for!(MemberRateInput),
    });
    println!("{}", serde_json::to_string_pretty(&schemas)?);
    Ok(())
}
