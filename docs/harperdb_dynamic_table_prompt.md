# Prompt for Claude: How to Create Dynamic Tables in a HarperDB Experimental Plugin

You are helping me write code for **HarperDB experimental plugins** (Component-based plugins using `handleApplication(scope)`).  
In this environment:

- `handleApplication(scope)` receives a **single argument**, the plugin scope.
- The plugin runs inside HarperDB's JS runtime and has access to the **HarperDB Resource API**, which includes:
  - `import { tables, databases } from "harperdb";`
  - Each table exposes:  
    ```ts
    Table.operation(operationObject: Object, authorize?: boolean): Promise<any>
    ```
    which executes a Harper **Operations API operation internally** (no HTTP).
- Dynamic schema behavior happens automatically when inserting records with new fields.
- Table creation uses the Operations API operation:  
  ```json
  {
    "operation": "create_table",
    "database": "data",
    "table": "my_table",
    "primary_key": "id"
  }
  ```

Your task is to write example code (TypeScript or JavaScript) that shows **how to dynamically create a table inside an experimental plugin** using the proper API.

## Requirements

1. Demonstrate how to import the Harper Resource API:
   ```ts
   import { tables, databases } from "harperdb";
   ```

2. Inside  
   ```ts
   export async function handleApplication(scope) { ... }
   ```
   show how to:
   - Ensure a schema/database exists (optional depending on the environment).
   - Create a table dynamically via the internal Operations API using  
     `databases.data.operation({ operation: "create_table", ... })`.
   - Use **safe, idempotent error handling** (ignore “already exists” errors).
   - Access the newly created table via `databases.data.my_table` or `tables.MyTable`.

3. Show an example insert that demonstrates **dynamic schema creation**, e.g.:
   ```ts
   await MyTable.operation({
     operation: "insert",
     records: [
       { id: "1", field_a: 123, field_b: "hello" }
     ]
   });
   ```

4. Ensure the code avoids:
   - Undocumented APIs  
   - Old Custom Functions APIs (`hdbCore`, `hdbApiClient`)
   - Any assumption that `handleApplication` gets more than one argument

5. Use Markdown and provide the final example as a complete code snippet.

## Deliverables

Produce:

- A short explanation of the approach
- A **complete plugin code example** implementing dynamic table creation
- A helper function `ensureTable(name)` that:
  - Calls `create_table` using `operation()`
  - Swallows “already exists” errors
  - Returns the table object ready for additional operations

---

If you need more details, ask.
