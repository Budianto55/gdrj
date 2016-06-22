'use strict';

viewModel.breakdown = new Object();
var ba = viewModel.breakdown;

ba.contentIsLoading = ko.observable(false);
ba.popupIsLoading = ko.observable(false);
ba.title = ko.observable('Branch Analysis');
ba.detail = ko.observableArray([]);
ba.limit = ko.observable(10);
ba.breakdownNote = ko.observable('');

ba.breakdownBy = ko.observable('customer.branchname');
ba.breakdownByChannel = ko.observable('customer.channelname');
ba.breakdownByFiscalYear = ko.observable('date.fiscal');
ba.oldBreakdownBy = ko.observable(ba.breakdownBy());
ba.optionDimensions = ko.observableArray(rpt.optionDimensions().filter(function (d) {
	return d.field != 'customer.channelname';
}));

ba.expandRD = ko.observable(false);
ba.data = ko.observableArray([]);
ba.zeroValue = ko.observable(false);
ba.fiscalYear = ko.observable(rpt.value.FiscalYear());
ba.breakdownValue = ko.observableArray([]);
ba.breakdownRD = ko.observable("All");
ba.optionBranch = ko.observableArray([{
	id: "All",
	title: "RD & Non RD"
}, {
	id: "OnlyRD",
	title: "Only RD Sales"
}, {
	id: "NonRD",
	title: "Non RD Sales"
}]); //rpt.masterData.Channel()

ba.breakdown2ndLevel = ko.observable(false);
ba.breakdown2ndLevelKey = ko.observable('customer.name');
ba.level = ko.observable(2);

ba.buildStructure = function (data) {
	var rdCategories = ["RD", "Non RD"];
	var keys = ["_id_customer_branchname", "_id_customer_channelid", "_id_customer_channelname"];

	var fixEmptySubs = function fixEmptySubs(d) {
		var subs = [];
		rdCategories.forEach(function (cat, i) {
			var row = d.subs.find(function (e) {
				return e._id == cat;
			});
			if (row == undefined) {
				var newRow = {};
				newRow._id = cat;
				newRow.count = 1;
				newRow.subs = [];

				var newSubRow = {};
				newSubRow._id = cat;
				newSubRow.count = 1;
				newSubRow.subs = [];
				for (var p in d.subs[0]) {
					if (d.subs[0].hasOwnProperty(p) && p.search("PL") > -1) {
						newSubRow[p] = 0;
						newRow[p] = 0;
					}
				}
				newRow.subs.push(newSubRow);

				row = newRow;
			}

			subs[i] = row;
		});
		return subs;
	};

	var showAsBreakdown = function showAsBreakdown(data) {
		var renderTotalColumn = function renderTotalColumn(d) {
			var totalColumn = {};
			totalColumn._id = 'Total';
			totalColumn.count = 1;
			totalColumn.excludeFromTotal = true;

			var totalSubColumn = {};
			totalSubColumn._id = 'Total';
			totalSubColumn.count = 1;
			totalSubColumn.excludeFromTotal = true;

			var _loop = function _loop(p) {
				if (d.subs[0].hasOwnProperty(p) && p.search('PL') > -1) {
					totalColumn[p] = toolkit.sum(d.subs, function (e) {
						return e[p];
					});
					totalSubColumn[p] = toolkit.sum(d.subs, function (e) {
						return e[p];
					});
				}
			};

			for (var p in d.subs[0]) {
				_loop(p);
			}

			totalColumn.subs = [totalSubColumn];
			return totalColumn;
		};

		switch (ba.breakdownRD()) {
			case 'All':
				{
					data.forEach(function (d) {
						var totalColumn = renderTotalColumn(d);
						d.subs = [totalColumn].concat(d.subs);
						d.count = toolkit.sum(d.subs, function (e) {
							return e.count;
						});
					});
				}break;
			case 'OnlyRD':
				{
					data.forEach(function (d) {
						d.subs = d.subs.filter(function (e) {
							return e._id == 'RD';
						});
						d.count = toolkit.sum(d.subs, function (e) {
							return e.count;
						});
					});
				}break;
			case 'NonRD':
				{
					data.forEach(function (d) {
						d.subs = d.subs.filter(function (e) {
							return e._id != 'RD';
						});

						if (ba.expandRD()) {
							var totalColumn = renderTotalColumn(d);
							d.subs = [totalColumn].concat(d.subs);
						}

						d.count = toolkit.sum(d.subs, function (e) {
							return e.count;
						});
					});
				}break;
		}
	};

	var groupThenMap = function groupThenMap(data, group) {
		var op1 = _.groupBy(data, function (d) {
			return group(d);
		});
		var op2 = _.map(op1, function (v, k) {
			var key = { _id: k, subs: v };
			var sample = v[0];

			var _loop2 = function _loop2(prop) {
				if (sample.hasOwnProperty(prop) && prop != '_id') {
					key[prop] = toolkit.sum(v, function (d) {
						return d[prop];
					});
				}
			};

			for (var prop in sample) {
				_loop2(prop);
			}

			return key;
		});

		return op2;
	};

	if (ba.expandRD()) {
		var _parsed = groupThenMap(data, function (d) {
			return d._id._id_customer_branchname;
		}).map(function (d) {
			d.subs = groupThenMap(d.subs, function (e) {
				return e._id._id_customer_channelid == "I1" ? rdCategories[0] : rdCategories[1];
			}).map(function (e) {
				e.subs = groupThenMap(d.subs, function (f) {
					return f._id._id_customer_channelname;
				}).map(function (f) {
					f.subs = [];
					f.count = 1;
					return f;
				});

				e.count = e.subs.length;
				return e;
			});

			// INJECT THE EMPTY RD / NON RD
			d.subs = fixEmptySubs(d);

			d.count = toolkit.sum(d.subs, function (e) {
				return e.count;
			});
			return d;
		});

		ba.level(3);
		showAsBreakdown(_parsed);
		return _parsed;
	}

	if (ba.breakdown2ndLevel()) {
		var _parsed2 = groupThenMap(data, function (d) {
			return d._id._id_customer_branchname;
		}).map(function (d) {

			d.subs = groupThenMap(d.subs, function (e) {
				return e._id._id_customer_channelname;
			}).map(function (e) {

				e.subs = groupThenMap(d.subs, function (f) {
					return f._id._id_customer_name;
				}).map(function (f) {
					f.subs = [];
					f.count = 1;
					return f;
				});

				e.count = e.subs.length;
				return e;
			});

			d.count = toolkit.sum(d.subs, function (e) {
				return e.count;
			});
			return d;
		});

		ba.level(3);
		return _parsed2;
	}

	var parsed = groupThenMap(data, function (d) {
		return d._id._id_customer_branchname;
	}).map(function (d) {

		d.subs = groupThenMap(d.subs, function (e) {
			return e._id._id_customer_channelid == "I1" ? rdCategories[0] : rdCategories[1];
		}).map(function (e) {
			e.subs = [];
			e.count = 1;
			return e;
		});

		// INJECT THE EMPTY RD / NON RD
		d.subs = fixEmptySubs(d);

		d.count = toolkit.sum(d.subs, function (e) {
			return e.count;
		});
		return d;
	});

	ba.level(2);
	showAsBreakdown(parsed);
	return parsed;
};
ba.refresh = function () {
	var useCache = arguments.length <= 0 || arguments[0] === undefined ? false : arguments[0];

	var param = {};
	param.pls = [];
	param.groups = [ba.breakdownByChannel(), ba.breakdownBy()];
	param.aggr = 'sum';
	param.filters = rpt.getFilterValue(false, ba.fiscalYear);

	var breakdownValue = ba.breakdownValue().filter(function (d) {
		return d != 'All';
	});
	if (breakdownValue.length > 0) {
		param.filters.push({
			Field: ba.breakdownBy(),
			Op: '$in',
			Value: ba.breakdownValue()
		});
	}

	if (ba.breakdown2ndLevel()) {
		param.groups.push(ba.breakdown2ndLevelKey());
	}

	ba.oldBreakdownBy(ba.breakdownBy());
	ba.contentIsLoading(true);

	var fetch = function fetch() {
		toolkit.ajaxPost("/report/getpnldatanew", param, function (res) {
			if (res.Status == "NOK") {
				setTimeout(function () {
					fetch();
				}, 1000 * 5);
				return;
			}

			// if (ba.breakdown2ndLevel()) { // hardcode, use DUMMY data
			// 	res.Data.Data = branch_analysis_dummy
			// }

			var data = ba.buildStructure(res.Data.Data);

			ba.data(data);
			var date = moment(res.time).format("dddd, DD MMMM YYYY HH:mm:ss");
			ba.breakdownNote('Last refreshed on: ' + date);

			rpt.plmodels(res.Data.PLModels);
			ba.emptyGrid();
			ba.contentIsLoading(false);
			ba.render();
		}, function () {
			ba.emptyGrid();
			ba.contentIsLoading(false);
		}, {
			cache: useCache == true ? 'breakdown chart' : false
		});
	};

	fetch();
};

ba.clickExpand = function (e) {
	var right = $(e).find('i.fa-chevron-right').length;
	var down = $(e).find('i.fa-chevron-down').length;
	if (right > 0) {
		$(e).find('i').removeClass('fa-chevron-right');
		$(e).find('i').addClass('fa-chevron-down');
		$('tr[idparent=' + e.attr('idheaderpl') + ']').css('display', '');
		$('tr[idcontparent=' + e.attr('idheaderpl') + ']').css('display', '');
		$('tr[statusvaltemp=hide]').css('display', 'none');
	}
	if (down > 0) {
		$(e).find('i').removeClass('fa-chevron-down');
		$(e).find('i').addClass('fa-chevron-right');
		$('tr[idparent=' + e.attr('idheaderpl') + ']').css('display', 'none');
		$('tr[idcontparent=' + e.attr('idheaderpl') + ']').css('display', 'none');
	}
};
ba.emptyGrid = function () {
	$('.breakdown-view').replaceWith('<div class="breakdown-view ez"></div>');
};

ba.idarrayhide = ko.observableArray(['PL44A']);
ba.render = function () {
	if (ba.breakdownRD() == "OnlyRD") {
		ba.expandRD(false);
	}

	if (ba.data().length == 0) {
		$('.breakdown-view').html('No data found.');
		return;
	}

	// ========================= TABLE STRUCTURE

	var data = _.orderBy(ba.data(), function (d) {
		return d.PL8A;
	}, 'desc');

	var wrapper = toolkit.newEl('div').addClass('pivot-pnl-branch pivot-pnl').appendTo($('.breakdown-view'));

	var tableHeaderWrap = toolkit.newEl('div').addClass('table-header').appendTo(wrapper);

	var tableHeader = toolkit.newEl('table').addClass('table').appendTo(tableHeaderWrap);

	var tableContentWrap = toolkit.newEl('div').appendTo(wrapper).addClass('table-content');

	var tableContent = toolkit.newEl('table').addClass('table').appendTo(tableContentWrap);

	var trHeader = toolkit.newEl('tr').appendTo(tableHeader);

	toolkit.newEl('th').html('P&L').css('height', 34 * ba.level() + 'px').css('vertical-align', 'middle').addClass('cell-percentage-header').appendTo(trHeader);

	toolkit.newEl('th').html('Total').css('height', 34 * ba.level() + 'px').css('vertical-align', 'middle').addClass('cell-percentage-header align-right').appendTo(trHeader);

	var trContents = [];
	for (var i = 0; i < ba.level(); i++) {
		trContents.push(toolkit.newEl('tr').appendTo(tableContent));
	}

	// ========================= BUILD HEADER

	var columnWidth = 100;
	var totalColumnWidth = 0;
	var pnlTotalSum = 0;
	var dataFlat = [];

	var countWidthThenPush = function countWidthThenPush(each, key) {
		var currentColumnWidth = each._id.length * 4;
		if (currentColumnWidth < columnWidth) {
			currentColumnWidth = columnWidth;
		}

		each.key = key.join('_');
		dataFlat.push(each);
		totalColumnWidth += currentColumnWidth;
	};

	data.forEach(function (lvl1, i) {
		var thheader1 = toolkit.newEl('th').html(lvl1._id).attr('colspan', lvl1.count).addClass('align-center').appendTo(trContents[0]);

		if (ba.level() == 1) {
			countWidthThenPush(lvl1, [lvl1._id]);
			return;
		}
		thheader1.attr('colspan', lvl1.count);

		lvl1.subs.forEach(function (lvl2, j) {
			var thheader2 = toolkit.newEl('th').html(lvl2._id).addClass('align-center').appendTo(trContents[1]);

			if (ba.level() == 2) {
				countWidthThenPush(lvl2, [lvl1._id, lvl2._id]);
				return;
			}
			thheader2.attr('colspan', lvl2.count);

			lvl2.subs.forEach(function (lvl3, k) {
				console.log("---------------", lvl3._id, lvl3);

				var thheader3 = toolkit.newEl('th').html(lvl3._id).addClass('align-center').appendTo(trContents[2]);

				if (ba.level() == 3) {
					countWidthThenPush(lvl3, [lvl1._id, lvl2._id, lvl3._id]);
					return;
				}
				thheader3.attr('colspan', lvl3.count);
			});
		});
	});

	// ========================= CONSTRUCT DATA

	var plmodels = _.sortBy(rpt.plmodels(), function (d) {
		return parseInt(d.OrderIndex.replace(/PL/g, ''));
	});
	var exceptions = ["PL94C" /* "Operating Income" */, "PL39B" /* "Earning Before Tax" */, "PL41C" /* "Earning After Tax" */];
	var netSalesPLCode = 'PL8A';
	var netSalesPlModel = rpt.plmodels().find(function (d) {
		return d._id == netSalesPLCode;
	});
	var netSalesRow = {},
	    changeformula = void 0,
	    formulayo = void 0;

	var rows = [];

	rpt.fixRowValue(dataFlat);

	plmodels.forEach(function (d) {
		var row = { PNL: d.PLHeader3, PLCode: d._id, PNLTotal: 0 };
		dataFlat.forEach(function (e) {
			var breakdown = e.key;
			var value = e['' + d._id];
			value = toolkit.number(value);
			row[breakdown] = value;

			if (toolkit.isDefined(e.excludeFromTotal)) {
				return;
			}

			row.PNLTotal += value;
		});
		dataFlat.forEach(function (e) {
			var breakdown = e.key;
			var percentage = toolkit.number(e['' + d._id] / row.PNLTotal) * 100;
			percentage = toolkit.number(percentage);

			if (d._id != netSalesPLCode) {
				percentage = toolkit.number(row[breakdown] / netSalesRow[breakdown]) * 100;
			}

			if (percentage < 0) percentage = percentage * -1;

			row[breakdown + ' %'] = percentage;
		});

		if (exceptions.indexOf(row.PLCode) > -1) {
			return;
		}

		rows.push(row);
	});

	// ========================= PLOT DATA

	tableContent.css('min-width', totalColumnWidth);

	rows.forEach(function (d, i) {
		pnlTotalSum += d.PNLTotal;

		var PL = d.PLCode;
		PL = PL.replace(/\s+/g, '');
		var trHeader = toolkit.newEl('tr').addClass('header' + PL).attr('idheaderpl', PL).attr('data-row', 'row-' + i).appendTo(tableHeader);

		trHeader.on('click', function () {
			ba.clickExpand(trHeader);
		});

		toolkit.newEl('td').html('<i></i>' + d.PNL).appendTo(trHeader);

		var pnlTotal = kendo.toString(d.PNLTotal, 'n0');
		toolkit.newEl('td').html(pnlTotal).addClass('align-right').appendTo(trHeader);

		var trContent = toolkit.newEl('tr').addClass('column' + PL).attr('idpl', PL).attr('data-row', 'row-' + i).appendTo(tableContent);

		dataFlat.forEach(function (e, f) {
			var key = e.key;
			var value = kendo.toString(d[key], 'n0');

			var percentage = kendo.toString(d[key + ' %'], 'n2');

			if ($.trim(value) == '') {
				value = 0;
			}

			var cell = toolkit.newEl('td').html(value).addClass('align-right').appendTo(trContent);
		});

		var boolStatus = false;
		trContent.find('td').each(function (a, e) {
			if ($(e).text() != '0' && $(e).text() != '0.00 %') {
				boolStatus = true;
			}
		});

		if (boolStatus) {
			trContent.attr('statusval', 'show');
			trHeader.attr('statusval', 'show');
		} else {
			trContent.attr('statusval', 'hide');
			trHeader.attr('statusval', 'hide');
		}
	});

	// ========================= CONFIGURE THE HIRARCHY
	rpt.buildGridLevels(rows);
};

ba.prepareEvents = function () {
	$('.breakdown-view').parent().on('mouseover', 'tr', function () {
		var rowID = $(this).attr('data-row');

		var elh = $('.breakdown-view .table-header tr[data-row="' + rowID + '"]').addClass('hover');
		var elc = $('.breakdown-view .table-content tr[data-row="' + rowID + '"]').addClass('hover');
	});
	$('.breakdown-view').parent().on('mouseleave', 'tr', function () {
		$('.breakdown-view tr.hover').removeClass('hover');
	});
};

ba.showExpandAll = function (a) {
	if (a == true) {
		$('tr.dd').find('i').removeClass('fa-chevron-right');
		$('tr.dd').find('i').addClass('fa-chevron-down');
		$('tr[idparent]').css('display', '');
		$('tr[idcontparent]').css('display', '');
		$('tr[statusvaltemp=hide]').css('display', 'none');
	} else {
		$('tr.dd').find('i').removeClass('fa-chevron-down');
		$('tr.dd').find('i').addClass('fa-chevron-right');
		$('tr[idparent]').css('display', 'none');
		$('tr[idcontparent]').css('display', 'none');
		$('tr[statusvaltemp=hide]').css('display', 'none');
	}
};

ba.showZeroValue = function (a) {
	ba.zeroValue(a);
	if (a == true) {
		$(".table-header tbody>tr").each(function (i) {
			if (i > 0) {
				$(this).attr('statusvaltemp', 'show');
				$('tr[idpl=' + $(this).attr('idheaderpl') + ']').attr('statusvaltemp', 'show');
				if (!$(this).attr('idparent')) {
					$(this).show();
					$('tr[idpl=' + $(this).attr('idheaderpl') + ']').show();
				}
			}
		});
	} else {
		$(".table-header tbody>tr").each(function (i) {
			if (i > 0) {
				$(this).attr('statusvaltemp', $(this).attr('statusval'));
				$('tr[idpl=' + $(this).attr('idheaderpl') + ']').attr('statusvaltemp', $(this).attr('statusval'));
			}
		});
	}

	ba.showExpandAll(false);
};

ba.optionBreakdownValues = ko.observableArray([]);
ba.breakdownValueAll = { _id: 'All', Name: 'All' };
ba.changeBreakdown = function () {
	var all = ba.breakdownValueAll;
	var map = function map(arr) {
		return arr.map(function (d) {
			if ("customer.channelname" == ba.breakdownBy()) {
				return d;
			}
			if ("customer.keyaccount" == ba.breakdownBy()) {
				return { _id: d._id, Name: d._id };
			}

			return { _id: d.Name, Name: d.Name };
		});
	};
	setTimeout(function () {
		switch (ba.breakdownBy()) {
			case "customer.areaname":
				ba.optionBreakdownValues([all].concat(map(rpt.masterData.Area())));
				ba.breakdownValue([all._id]);
				break;
			case "customer.region":
				ba.optionBreakdownValues([all].concat(map(rpt.masterData.Region())));
				ba.breakdownValue([all._id]);
				break;
			case "customer.zone":
				ba.optionBreakdownValues([all].concat(map(rpt.masterData.Zone())));
				ba.breakdownValue([all._id]);
				break;
			case "product.brand":
				ba.optionBreakdownValues([all].concat(map(rpt.masterData.Brand())));
				ba.breakdownValue([all._id]);
				break;
			case "customer.branchname":
				ba.optionBreakdownValues([all].concat(map(rpt.masterData.Branch())));
				ba.breakdownValue([all._id]);
				break;
			case "customer.channelname":
				ba.optionBreakdownValues([all].concat(map(rpt.masterData.Channel())));
				ba.breakdownValue([all._id]);
				break;
			case "customer.keyaccount":
				ba.optionBreakdownValues([all].concat(map(rpt.masterData.KeyAccount())));
				ba.breakdownValue([all._id]);
				break;
		}
	}, 100);
};
ba.changeBreakdownValue = function () {
	var all = ba.breakdownValueAll;
	setTimeout(function () {
		var condA1 = ba.breakdownValue().length == 2;
		var condA2 = ba.breakdownValue().indexOf(all._id) == 0;
		if (condA1 && condA2) {
			ba.breakdownValue.remove(all._id);
			return;
		}

		var condB1 = ba.breakdownValue().length > 1;
		var condB2 = ba.breakdownValue().reverse()[0] == all._id;
		if (condB1 && condB2) {
			ba.breakdownValue([all._id]);
			return;
		}

		var condC1 = ba.breakdownValue().length == 0;
		if (condC1) {
			ba.breakdownValue([all._id]);
		}
	}, 100);
};

vm.currentMenu('Branch Analysis');
vm.currentTitle('Branch Analysis');
vm.breadcrumb([{ title: 'Godrej', href: '#' }, { title: 'Branch Analysis', href: '/web/report/dashboard' }]);

ba.title('Branch Analysis');

rpt.refresh = function () {
	ba.changeBreakdown();
	setTimeout(function () {
		ba.breakdownValue(['All']);
		ba.refresh(false);
	}, 200);

	ba.prepareEvents();
};

$(function () {
	rpt.refresh();
});