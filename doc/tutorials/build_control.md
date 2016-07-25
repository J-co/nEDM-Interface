This tutorial gives an overview of how one builds controls in a particular
database.

_Control_ components are built from documents of type `"control"` in the
database in question.  When one defines a `"control"` document and uploads it
into the database, it will automatically be included in the Controls site of a
database.  The typical way to define a control document is to create a `.json`
file in the `data` directory of the corresponding database (subsystem).

Let's have a look at an example control document:

```javascript
{
  "_id" : "measure",  // ID of document, must be unique
  "type" : "control", // type, must be "control"
  "title" : "Make single measurement", // Title
  "description" : "Record single log file", // description, help.  Can also contain HTML
  "html" : "...", // main html of control component
  "script" : "..." // main script
}
```

The first 4 fields (`"_id"`, `"type"`, `"title"`, and `"description"`) are
self-explanatory, where the only point that should be made is that
`"description"` may, and _should_, include HTML.  This is an ideal location to
document to the user how your interface component works.  One may also define
other fields which may be used to pass information to the script run on the
page.  The content of the `"description"` field shows up inside a popup, which
may be accessed via an _Info_ button on the page.

We will examine the other two fields in the following:

### `"html"` and `"script"`

The `"html"` field provides the main HTML layout for the component.  Here you
should define as much HTML as possible, which is general everything that may be
statically defined.

The `"script"` field is also important, though optional.  It allows a user to
define code that will run when the page is loaded.  It is important to note
that this must contain a function defined like:

```javascript
{

  "script" : "
    function($theDiv, docobj) {
      // ... User code run that is run on page load
  }
"
}
```

where the first argument (in this case, `$theDiv`) is the `<div>` object in
which the component is inserted, and the second argument (in this case,
`docobj`) is the full JSON document from the database.  Having access to the
full JSON document allows one to save additional configuration information in
JSON format, which is especially useful for configuring devices.  Remember,
that you may define any extra information that is included here, as long as you
don't use the reserved field names listed above.

Let's look a little more closely at the function defined in `"script"`.

```javascript
function($theDiv, docobj) {
  // n.b. console.log prints something in the browser developer debug window.
  // In this function we have a few "global variables" defined, in particular:
  console.log(nedm);  // The nedm variable is an nEDMDB object.
  console.log(theCurrentPage); // jQuery object referring to this current page.
}
```

The `nedm` variable is an instantiation of the {@link module:lib/nedm~nEDMDatabase|nEDMDatabase} class that
points to the current database.  For example, if one were on the Hg Laser page,
this would point by default to the database `"nedm%2Fhg_laser"`.  (Of course,
accessing other databases are possible, see the documentation for {@link
module:lib/nedm~nEDMDatabase#get_database|get_database}.) `theCurrentPage` is a
{@link https://api.jquery.com/Types/#jQuery|jQuery object} that wraps the DOM
object of the page.

### Technical details

This describes how the assembly of control documents actually works using
functionality from CouchDB.  For building your page, you generally don't need
to know this information.

Control pages take advantage of CouchDB {@link
http://docs.couchdb.org/en/latest/couchapp/ddocs.html#list-functions list
functions}, which take the results from a view and format it into an HTML page.
In this case, the view returns the list of control documents.

The list function loops through each control document and outputs the following
for each document:

```html
<div id='unique_name'>
  <!-- content of doc.html -->
<div>
<script type='text/javascript'><!--
  (function() {
    var __base = require('lib/nedm');
    var nedm = new __base.nEDMDatabase('name_of_db'); // name_of_db automatically inserted by list function
    var theCurrentPage = $('#unique_name_of_page');
    theCurrentPage.on('pagecreate', function() {(
    // content of doc.script, should be of the form:
    // function($theDiv, doc) {
    //  ...
    // }
    )($('#unique_name') /* jQuery Object of div DOM */, doc /* content of doc */);
    }
  })();
//-->
</script>
```


