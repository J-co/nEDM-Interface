/**
 * module defining class monitoring graph
 * @module lib/monitoring_graph
 *
 * @requires module:lib/math
 * @requires module:dygraph-combined
 * @requires module:lib/nedm
 */
var dygraphs = require("dygraph-combined");
var math_lib = require("lib/math");

var bs = math_lib.bs;
var GetNumberParts = math_lib.GetNumberParts;

/**
 * @class
 * MonitoringGraph provides an interface to the dygraph functionality
 *
 * @param {Object} $adiv - where the graph should show up
 * @param {String|Array} data_name - name or list of data names
 * @param {Number} since_time_in_secs - grab since a time seconds from 'now'
 * @param {Object} database object
 * @public
 */
exports.MonitoringGraph = function ($adiv, data_name, since_time_in_secs, adb, opts) {

    // Private variables
    var myDB = adb;
    var data = [];
    if (!opts) opts = {};
    var defaults = {
                    drawPoints: true,
                    showRoller: false,
                        labels: ['Time'].concat(data_name),
        connectSeparatedPoints: true,
               xAxisLabelWidth: 60,
                        height: dygraphs.Dygraph.DEFAULT_HEIGHT, // explicitly set
                 zoomCallback : RecalcAxisLabels
    };
    for (var k in defaults) {
      if (!(k in opts)) {
        opts[k] = defaults[k];
      }
    }
    var graph = new dygraphs.Dygraph($adiv, data, opts);

    var name = data_name;
    var group_level = 9;

    var tthis = this;
    var isSyncing = false;
    var wasLive = false;
    var isListening = false;
    var time_range;
    var until_time;
    var time_prev;
    var myBaseURL = $('.ui-page-active').data('url');

    /**
     * show the particular container (if hidden)
     *
     * @param {Object} ev
     * @param {Object} ui
     * @private
     */
    this.graph = graph;

    /**
     * show the particular container (if hidden)
     *
     * @param {Object} ev
     * @param {Object} ui
     * @private
     */
    function ShowContainer(ev, ui) {
        if ($(ui.toPage).data("url") !== myBaseURL) return;
        if (wasLive) {
          BeginListening();
        }
    }

    /**
     * hide the particular container (if shown)
     *
     * @param {Object} ev
     * @param {Object} ui
     * @private
     */
    function HideContainer(ev, ui) {
        if ($(ui.prevPage).data("url") !== myBaseURL) return;
        if (isListening) {
          EndListening();
          wasLive = true;
        } else {
          wasLive = false;
        }
    }

    /**
     * Synchronize with the database, called by event handler
     *
     * @private
     */
    var __basenedm = require("lib/nedm");
    var nedm = new __basenedm.nEDMDatabase();
    function HandleListening(msg) {
        // don't sync too often...
        if (isSyncing) return;
        isSyncing = true;
        var arr = [];
        var t;
        for (var k in msg) {
          t = msg[k].time;
          t.unshift(k);
          arr[arr.length] = { key: t, value: { sum : msg[k].value, count : 1 } };
        }
        var all_data = arr.map(DateFromKeyVal(graph.getOption("customBars")), tthis).filter( function(o) {
            if (o !== null) return true;
            return false;
        });
        var recv_length = all_data.length;
        if (recv_length !== 0) {
            MergeData(all_data);
        }
        if (data.length !== 0 && time_range !== 0) {
            var time_before_now = new Date(data[data.length-1][0].getTime() - time_range*1000);
            tthis.removeBeforeDate(time_before_now);
        }
        tthis.update();
        isSyncing = false;
    }

    /**
     * Prepend to the 'data' variable
     *
     * @param {Array} r - data to prepend
     * @private
     */
    function PrependData(r) {
      for (var i=0;i<r.length;i++) {
          data.unshift(r[i]);
      }
    }

    /**
     * Append to the 'data' variable
     *
     * @param {Array} r - data to append
     * @private
     */

    function AppendData(r) {
         var append = 0;
         for (var i=0;i<r.length;i++) {
             data.push(r[i]);
             append++;
         }
         return append;
    }

    /**
	 * Merge data in to data variable.  This will ensure that data is in
	 * chronological order.
     *
     * @param {Array} new_data - data to be merged in
     * @private
     */

    function MergeData(new_data) {
      if (new_data.length === 0) return;
      var dt = data;
      if (dt.length === 0 || new_data[0][0] < dt[0][0]) {
        return PrependData(new_data);
      }
      // otherwise we need to merge
      var curIndex = dt.length-1;
      var dIndex = 0;
      var comp_func = function(a,b) { return a[0] - b[0]; };
      while (dIndex < new_data.length && new_data[dIndex][0] >= dt[0][0]) {
          // find where we need to insert
          var cI = bs(dt, new_data[dIndex], comp_func, 0, curIndex);
          if (cI >= 0) {
              // means the value is already at an index
              curIndex = cI;
              for (var j=1;j<new_data[dIndex].length;j++) {
                 if (new_data[dIndex][j] !== null) dt[curIndex][j] = new_data[dIndex][j];
              }
          } else {
              curIndex = ~cI;
              dt.splice(curIndex, 0, new_data[dIndex]);
          }
          dIndex += 1;
      }
      // Take care of the rest.
      new_data.splice(0, dIndex);
      PrependData(new_data);
    }

    /**
	 * Recalculate what the axis labels should be.
     *
     * @private
     */

    function RecalcAxisLabels() {
         var range = graph.yAxisRange();
         var one_side = GetNumberParts(range[1]);
         var subtract = GetNumberParts(range[1] - range[0]);
         var sfs = one_side.exponent - subtract.exponent + 2;
         graph.updateOptions({ axes : { y : { sigFigs : sfs } } });
    }

    /**
	 * Get Date object from Key
     *
     * @param {Array} obj - key like accepted by nedm.dateFromKey
     * @return {Object}
     * @private
     */

    function DateFromKeyVal(hasCustomBars) {
       if (!hasCustomBars) {
         return function(obj) {
           var outp = [ nedm.dateFromKey(obj.key) ];
           var seen = false;
           var data_name = name;
           for (var i=0;i<data_name.length;i++) {
               if (data_name[i] == obj.key[0]) {
                   outp.push(obj.value.sum/obj.value.count);
                   seen = true;
               } else outp.push(null);
           }
           if (!seen) return null;
           return outp;
         };
       } else {
         return function(obj) {
          var outp = [ nedm.dateFromKey(obj.key) ];
          var seen = false;
          var data_name = name;
          for (var i=0;i<data_name.length;i++) {
              if (data_name[i] == obj.key[0]) {
                  outp.push([obj.value.min, obj.value.sum/obj.value.count, obj.value.max]);
                  seen = true;
              } else outp.push(null);
          }
          if (!seen) return null;
          return outp;
        };
      }
    }

    /**
	 * Stop listening for changes
     *
     * @private
     */

    function EndListening() {
      myDB.off("latest", HandleListening);
      isSyncing = false;
      isListening = false;
    }

    /**
	 * Begin listening for changes
     *
     * @private
     */

    function BeginListening() {
      EndListening();
      isListening = true;
      myDB.on("latest", HandleListening);
    }

    // Public interface

    /**
	 * Return name (variables)
     *
     * @return {Array} list of names
     * @public
     */

    this.name = function() { return name; };


    /**
	 * Get group level
     *
     * 1 = Year
     * 2 = Month
     * 3 = Day
     * 4 = Hour
     * 5 = Minute
     * 6 = Second
     * > 6, no averaging
     *
     * @return {Number} group level
     * @public
     */

    this.groupLevel = function() { return group_level; };

    /**
	 * Set group level, or grouping used to average the data
     *
     * 1 = Year
     * 2 = Month
     * 3 = Day
     * 4 = Hour
     * 5 = Minute
     * 6 = Second
     * > 6, no averaging
     * @param {Number} gl - set group level
     * @public
     */

    this.setGroupLevel = function(gl) {
      group_level = gl;
      if (gl <= 6) {
        graph.updateOptions( { customBars : true }, true );
      } else {
        graph.updateOptions( { customBars : false }, true );
      }
    };

    /**
	 * Update the graph with current data, settings, etc.
     *
     * @public
     */

    this.update = function() {
         graph.updateOptions( { 'file': data, 'labels' : ['Time'].concat(name) } );
         RecalcAxisLabels();
    };

    /**
	 * Destroy the plot (like destructor).  Stops listening, removes event handlers
     *
     * @public
     */

    this.destroy = function() {
      EndListening();
      $(document).off( { pagecontainershow : ShowContainer,
                         pagecontainerhide : HideContainer });
    };

    /**
	 * change the displayed time range.  This reloads all the data, assuming
	 * that none of it is 'good'.
     *
     * @param {Object} prev_time - previous time
     * @param {Object} until_t - go until time.
     * @param {Function} callback() - called once everything is completed
     *    The function will be called without an argument if something went wrong.
	 *    Otherwise it will be called with the object :
	 *      { loaded : # entries, done : true/false, variable : variable name }
     * @return {Object} returns an object with the
	 * @public
     */
    this.changeTimeRange = function (prev_time, until_t, callback) {

        time_prev = prev_time;
        if (typeof until_t === 'object' ) {
          // this means we go until a particular time
          if (prev_time > until_t) {
              toastr.error("Time incorrect: " + prev_time.toString() + " > " + until_t.toString(), "Time");
              if (callback) callback();
              return;
          }
          until_time = until_t;
          time_range = 0;
          EndListening();
        } else {
          until_time = 0;
          time_range = ((new Date()).getTime() - time_prev)/1000;
          BeginListening();
        }
        data.length = 0;
        // first determine what the earliest date is
        var last_key = [9999];
        if (until_time !== 0) {
            last_key = [
                     until_time.getUTCFullYear(), until_time.getUTCMonth(),
                     until_time.getUTCDate(), until_time.getUTCHours(),
                     until_time.getUTCMinutes(), until_time.getUTCSeconds()-1];
        }
        first_key = [
                     time_prev.getUTCFullYear(), time_prev.getUTCMonth(),
                     time_prev.getUTCDate(), time_prev.getUTCHours(),
                     time_prev.getUTCMinutes(), time_prev.getUTCSeconds()];

        if (name.length === 0 && callback) callback();
        var warning_shown = false;
        var names_to_check = name.length;
        function view_clbck(cr_name) {
            return function(e, o) {
              names_to_check -= 1;
              var ret_obj = { variable : cr_name, done : true };
              if (e === null) {
                var all_data = o.rows.map(DateFromKeyVal(graph.getOption("customBars")), tthis).filter( function(o) {
                    if (o !== null) return true;
                    return false;
                });
                var recv_length = all_data.length;
                if (recv_length !== 0) {
                    MergeData(all_data);
                }
              } else {
                ret_obj.abort = true;
              }
              if (callback) {
                  callback({ variable : cr_name,
                                 done : true });
              }
              if (names_to_check <= 0) tthis.update();
            };
        }

        function UpdateProgress(var_name) {
          if (!callback) {
              return function(evt) {};
          }
          return function(evt) {
             callback( {
              variable : var_name,
              progress : evt
            });
          };
        }
        var ret_obj = {};
        for (var i=0;i<name.length;i++) {
            var new_first_key = first_key.slice();
            var new_last_key = last_key.slice();
            var curr_name = name[i];
            new_first_key.unshift(curr_name);
            new_last_key.unshift(curr_name);
            var opts = { descending: true,
                          startkey : new_last_key,
                            endkey : new_first_key,
                            reduce : true,
                            group_level : tthis.groupLevel()
                            };
            ret_obj[curr_name] = myDB.getView("slow_control_time", "slow_control_time",
                  { opts : opts }, { success: view_clbck(curr_name), progress: UpdateProgress(curr_name) });
        }
        return ret_obj;
    };
    /**
	 * Add a variable name (or list of names) to the data to be shown
     *
     * @param {string|Array} aname - string or array of strings with variables to be added
     * @return {boolean} true if all could be added, otherwise false.
	 * @public
     */

    this.addDataName = function(aname) {
        if (!aname) return false;
        if (!Array.isArray(aname)) aname = [ aname ];
        var retVal = false;
        var arr = name;
        aname.forEach(function(ev) {
          if (arr.indexOf(ev) == -1) {
            arr.push(ev);
            retVal = true;
          }
        });
        return retVal;
    };

    /**
	 * Remove a variable name (or list of names) from the data to be shown
     *
     * @param {string|Array} aname - string or array of strings with variables to be removed
     * @param {Function} callback - function called after function is complete.
	 * @public
     */
    this.removeDataName = function(aname, callback) {
        if (!Array.isArray(aname)) {
          aname = [ aname ];
        }
        var wasRemoved = false;
        var arr = name;
        aname.forEach(function(ev) {
            var anIndex = arr.indexOf(ev);
            if (anIndex == -1 ) return;
            wasRemoved = true;
            arr.splice(anIndex, 1);
            data.every( function(o) { o.splice(anIndex+1, 1); return true; } );
        });
        if (!wasRemoved) return;
        tthis.update();
        if (callback) callback();
    };

    /**
	 * Remove all data before given date
     *
     * @param {Object} adate - particular date.
	 * @public
     */

    this.removeBeforeDate = function(adate) {
        if (data.length === 0) return 0;
        var j = 0;
        while (j < data.length && data[j][0].getTime() < adate.getTime()) j++;
        return data.splice(0, j);
    };

    // Function calls for setup
    this.changeTimeRange(since_time_in_secs, 0);

    $(document).on( { pagecontainershow : ShowContainer,
                      pagecontainerhide : HideContainer });

};


