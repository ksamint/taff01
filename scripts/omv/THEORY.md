# OMV: Ontology, Model, View

A way to understand any system that has many kinds of thing and many people
asking different questions about it. Built in taff01; meant for tda01.

## The three layers

| Layer | Job | Holds |
| --- | --- | --- |
| **O · Ontology** | Defines what can be talked about | Object types, relation types with their meaning, tiers, rules |
| **M · Model** | Describes the system as one whole | Objects and the relations between them, each of a type O defines |
| **V · View** | Looks at M from one object with one question | A centre, a question, a context and a form |

O is vocabulary and law. M is fact. V is a reading of fact. A view never
changes M, and M never contains a type O does not define.

## O: four things, not one

1. **Object types.** Each with a one-line meaning.
2. **Relation types.** Each has a meaning, the types it may join, and a
   reading in both directions ("is part of" / "contains"). A relation type is
   the unit of meaning: everything V can ask is built from these.
3. **Ranking.** Objects of the same type are not equal. A *tier* is a
   judgement, made once, about how close a thing is to the system's purpose.
   Inside a tier the order is *measured*: how many other things cannot exist
   without it. Anything that can be recomputed from other things is a view
   of them and ranks last.
4. **Rules.** Statements M must obey, written so a program can check them.

## M: one typed graph

M is a set of objects and a set of relations, nothing else. Structure,
responsibility, authority, flow, time, resource, dependency and value are not
separate models: each is the part of the one graph made of certain relation
types. That is what keeps them consistent.

Every relation is either **declared** (written by a person or read from a
source of truth) or **derived** (computed from declared ones). Derived
relations are marked and never edited.

M has a level. At the **type level** it says what kinds of thing a product
manages (a Task belongs to a Project). At the **instance level** it says what
actually exists (project P1 has 14 tasks). A repository map is the instance
level of the codebase (this module, this table) joined to the type level of
the product. Live instances stay in the running system.

## V: a function

    V = View(M; o, q, c, r)

| Input | Meaning | Example |
| --- | --- | --- |
| **o** centre | The object looked from | the Task concept, the Planning module, the Guest role |
| **q** question | Which relation types to follow | Structure follows "is part of" |
| **c** context | Who is looking, at which version, how deep | viewer Guest; commit 8349f1a; one relation from the centre |
| **r** form | How it is drawn | tree, matrix, path, groups |

Four consequences:

- **A question is a choice of relation types.** V invents no meaning; it
  selects from O. Adding a question never needs new data, and adding a
  relation type makes it available to every question that names it.
- **The form follows the shape of the relation.** Containment is a tree. A
  relation between two sets is a matrix. An order is a path or a timeline;
  when each step names who acts, the path is drawn as a swimlane, one row
  per actor. Anything else is groups. The form is not a matter of taste.
- **The centre is not the viewer.** A manager looking at project P1 has P1 as
  centre and themselves as context. What they may see is decided by c.
- **Every view carries its provenance:** its centre, question, model version
  and conditions. Two people with the same four inputs see the same view.

The number of views is objects × questions × contexts × forms. Most are
empty. An empty view is information: M has nothing of that kind there.

## The eight questions

| Question | Asks | Follows | Form |
| --- | --- | --- | --- |
| Structure | What is it made of, and what is it part of? | part of | tree |
| Responsibility | Who takes part, and who answers for it? | role held at, role held by | groups |
| Authority | Who may do what? | offers the function, may do | matrix |
| Flow | How does it move forward? | takes part in, step of, happens in | path |
| Time | When, and in what order? | gives a time to | groups |
| Resource | What does it take? | kept by, stored in, belongs to | groups |
| Dependency | What does it need, and what needs it? | needs, cannot exist without, reads or writes | groups |
| Value and proof | Why does it exist, and how do we know it works? | specified by, must satisfy, stated in | groups |

## Rules of the method

1. Define before you model. A relation with no type in O is not recorded.
2. Model once. If two views disagree, M is wrong, not one of the views.
3. Read what can be read. Whatever a source of truth declares is extracted,
   not typed. People write only judgement: tiers, flows, ownership.
4. Mark what is computed. Derived relations are labelled wherever shown.
5. Check the model against O on every change.
6. Say what is missing. A thing people ask about that the system does not
   have is an object marked as not modelled, not an omission.
7. Views are disposable. Only O and M are kept under version control.

## What it is for

- **Orientation.** Start at the whole, change the question, then the centre.
- **Impact.** Centre a table or a module, ask Dependency: what breaks.
- **Coverage.** Ask Value and proof of each module: which have no
  specification. Ask Authority of each role: what it can reach.
- **Decisions.** A level the data lacks appears, marked, in Structure.
