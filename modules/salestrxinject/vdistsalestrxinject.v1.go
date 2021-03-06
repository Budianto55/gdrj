package main

import (
	"eaciit/gdrj/model"
	"eaciit/gdrj/modules"
	"os"

	"flag"
	"github.com/eaciit/dbox"
	"github.com/eaciit/orm/v1"
	"github.com/eaciit/toolkit"
	"strings"
	"sync"
	"time"
)

var conn dbox.IConnection
var count, step, fiscalyear int
var vdistdetail string
var vdistheader string
var mutex *sync.Mutex
var eperiode, speriode time.Time
var ggrossamount, cggrossamount float64

func setinitialconnection() {
	var err error
	conn, err = modules.GetDboxIConnection("db_godrej")

	if err != nil {
		toolkit.Println("Initial connection found : ", err)
		os.Exit(1)
	}

	err = gdrj.SetDb(conn)
	if err != nil {
		toolkit.Println("Initial connection found : ", err)
		os.Exit(1)
	}
}

var (
	shs           = toolkit.M{}
	pcs           = toolkit.M{}
	ccs           = toolkit.M{}
	ledgers       = toolkit.M{}
	prods         = toolkit.M{}
	custs         = toolkit.M{}
	vdistskus     = toolkit.M{}
	mapskuids     = toolkit.M{}
	lastSalesLine = toolkit.M{}
)

func getCursor(obj orm.IModel) dbox.ICursor {
	c, e := gdrj.Find(obj, nil, nil)
	if e != nil {
		return nil
	}
	return c
}

func prepMaster() {
	pc := new(gdrj.ProfitCenter)
	cc := new(gdrj.CostCenter)
	prod := new(gdrj.Product)
	ledger := new(gdrj.LedgerMaster)

	var e error

	cpc := getCursor(pc)
	defer cpc.Close()
	for e = cpc.Fetch(pc, 1, false); e == nil; {
		pcs.Set(pc.ID, pc)
		pc = new(gdrj.ProfitCenter)
		e = cpc.Fetch(pc, 1, false)
	}

	ccc := getCursor(cc)
	defer ccc.Close()
	for e = ccc.Fetch(cc, 1, false); e == nil; {
		ccs.Set(cc.ID, cc)
		cc = new(gdrj.CostCenter)
		e = ccc.Fetch(cc, 1, false)
	}

	cprod := getCursor(prod)
	defer cprod.Close()
	for e = cprod.Fetch(prod, 1, false); e == nil; {
		prods.Set(prod.ID, prod)
		prod = new(gdrj.Product)
		e = cprod.Fetch(prod, 1, false)
	}

	cledger := getCursor(ledger)
	defer cledger.Close()
	for e = cledger.Fetch(ledger, 1, false); e == nil; {
		ledgers.Set(ledger.ID, ledger)
		ledger = new(gdrj.LedgerMaster)
		e = cledger.Fetch(ledger, 1, false)
	}

	cust := new(gdrj.Customer)
	ccust := getCursor(cust)
	defer ccust.Close()
	for e = ccust.Fetch(cust, 1, false); e == nil; {
		custs.Set(cust.ID, cust)
		cust = new(gdrj.Customer)
		e = ccust.Fetch(cust, 1, false)
	}

	sku := new(gdrj.MappingInventory)
	cskus := getCursor(sku)
	defer cskus.Close()
	for e = cskus.Fetch(sku, 1, false); e == nil; {
		vdistskus.Set(sku.SKUID_VDIST, sku.ID)
		sku = new(gdrj.MappingInventory)
		e = cskus.Fetch(sku, 1, false)
	}

	sh := new(gdrj.SalesHeader)
	// cshs := getCursor(sh)
	filter := dbox.And(dbox.Gte("date", speriode), dbox.Lt("date", eperiode))
	// filter = dbox.Eq("_id", "FK/IGA/14001247")

	cshs, _ := gdrj.Find(sh,
		filter,
		toolkit.M{})
	defer cshs.Close()
	for e = cshs.Fetch(sh, 1, false); e == nil; {
		shs.Set(sh.ID, sh)
		sh = new(gdrj.SalesHeader)
		e = cshs.Fetch(sh, 1, false)
	}
}

func main() {
	setinitialconnection()
	defer gdrj.CloseDb()
	mutex = &sync.Mutex{}

	flag.StringVar(&vdistdetail, "vdistdetail", "rawsalesdetail1415", "vdistdetail representation of collection vdist detail that want to be processed. Default is blank")
	flag.StringVar(&vdistheader, "vdistheader", "rawsalesheader", "vdistheader representation of collection vdist header that want to be processed. Default is rawsalesheader")
	flag.IntVar(&fiscalyear, "year", 2015, "fiscal year to process. Default is 2015")
	flag.Parse()

	// if vdistdetail == "" {
	// 	toolkit.Println("VDist detail collection need to be fill,")
	// 	os.Exit(1)
	// }

	eperiode = time.Date(fiscalyear, 4, 1, 0, 0, 0, 0, time.UTC)
	speriode = eperiode.AddDate(-1, 0, 0)

	toolkit.Println("Reading Master")
	prepMaster()

	toolkit.Println("START...")

	conn, _ := modules.GetDboxIConnection("db_godrej")
	// filter := dbox.Eq("iv_no", "FK/IGA/14001247")
	crx, _ := conn.NewQuery().Select().From(vdistdetail).Cursor(nil)
	defer crx.Close()
	defer conn.Close()

	lastSalesLine = toolkit.M{}
	count = crx.Count()
	step = count / 100
	i := 0

	jobs := make(chan toolkit.M, count)
	result := make(chan string, count)
	for wi := 0; wi < 10; wi++ {
		go workerProc(wi, jobs, result)
	}

	t0 := time.Now()
	for {
		i++
		tkmsd := toolkit.M{}
		e := crx.Fetch(&tkmsd, 1, false)
		if e != nil {
			break
		}

		invid := toolkit.ToString(tkmsd.Get("iv_no", ""))

		if invid == "" {
			invid = "OTHER/04/2016"
			tkmsd.Set("iv_no", invid)
		}

		if lastSalesLine.Has(invid) {
			lastLineNo := lastSalesLine.GetInt(invid) + 1
			tkmsd.Set("lineno", lastLineNo)
			lastSalesLine.Set(invid, lastLineNo)
		} else {
			tkmsd.Set("lineno", 1)
			lastSalesLine.Set(invid, 1)
		}

		jobs <- tkmsd
		// gdrj.Save(st)
		if step == 0 {
			step = 100
		}

		if i%step == 0 {
			toolkit.Printfn("Processing %d of %d (%d) in %s",
				i, count, i/step,
				time.Since(t0).String())
		}
	}

	close(jobs)

	for ri := 0; ri < i; ri++ {
		ri++
		<-result
		if step == 0 {
			step = 100
		}

		if ri%step == 0 {
			toolkit.Printfn("Saving %d of %d (%d pct) in %s",
				ri, count, ri/step, time.Since(t0).String())
		}
	}

	toolkit.Printfn("Processing done in %s with gross %v and correct %v",
		time.Since(t0).String(), ggrossamount, cggrossamount)
}

func workerProc(wi int, jobs <-chan toolkit.M, result chan<- string) {
	workerconn, _ := modules.GetDboxIConnection("db_godrej")
	defer workerconn.Close()

	tkmsd := toolkit.M{}
	for tkmsd = range jobs {
		gdrjdate := new(gdrj.Date)

		st := new(gdrj.SalesTrx)
		st.SalesHeaderID = toolkit.ToString(tkmsd.Get("iv_no", ""))

		st.LineNo = tkmsd.GetInt("lineno")
		dgrossamount := toolkit.ToFloat64(tkmsd.Get("gross", 0), 6, toolkit.RoundingAuto)
		ggrossamount += dgrossamount

		if shs.Has(st.SalesHeaderID) {
			sho := shs.Get(st.SalesHeaderID).(*gdrj.SalesHeader)
			sho.OutletID = strings.ToUpper(sho.OutletID)

			if sho.SalesDiscountAmount != 0 && sho.SalesGrossAmount != 0 {
				st.DiscountAmount = dgrossamount * sho.SalesDiscountAmount / sho.SalesGrossAmount
			}

			if sho.SalesTaxAmount != 0 && sho.SalesGrossAmount != 0 {
				st.TaxAmount = dgrossamount * sho.SalesTaxAmount / sho.SalesGrossAmount
			}

			st.OutletID = sho.BranchID + sho.OutletID
			st.Date = sho.Date
			st.HeaderValid = true

			gdrjdate = gdrj.SetDate(sho.Date)
			st.Year = gdrjdate.Year
			st.Month = int(gdrjdate.Month)
			st.Fiscal = gdrjdate.Fiscal

		} else {
			st.HeaderValid = false
		}
		//brsap,iv_no,dtsales,inv_no,qty,price,gross,net
		st.SKUID_VDIST = toolkit.ToString(tkmsd.Get("inv_no", ""))
		if vdistskus.Has(st.SKUID_VDIST) {
			st.SKUID = toolkit.ToString(vdistskus[st.SKUID_VDIST])
		} else {
			st.SKUID = "not found"
		}

		st.SalesQty = toolkit.ToFloat64(tkmsd.Get("qty", 0), 6, toolkit.RoundingAuto)
		st.GrossAmount = dgrossamount
		st.NetAmount = toolkit.ToFloat64(tkmsd.Get("net", 0), 6, toolkit.RoundingAuto)

		if prods.Has(st.SKUID) {
			st.ProductValid = true
			st.Product = prods.Get(st.SKUID).(*gdrj.Product)
		} else {
			st.ProductValid = false
		}

		if custs.Has(st.OutletID) {
			st.CustomerValid = true
			st.Customer = custs.Get(st.OutletID).(*gdrj.Customer)
			if st.Customer.ChannelID == "I1" {
				st.CustomerValid = false
			}
		} else {
			st.CustomerValid = false
		}

		if st.ProductValid && st.CustomerValid {
			pcid := st.Customer.BranchID + st.Product.BrandCategoryID
			if pcs.Has(pcid) {
				st.PCValid = true
				st.PC = pcs.Get(pcid).(*gdrj.ProfitCenter)
			} else {
				st.PCValid = false
			}
		} else {
			st.PCValid = false
		}

		if st.CustomerValid && st.HeaderValid {
			cggrossamount += st.GrossAmount
		}

		st.Src = "VDIST"
		st.ID = toolkit.ToString(st.PrepareID())
		workerconn.NewQuery().From(st.TableName()).
			Save().Exec(toolkit.M{}.Set("data", st))

		result <- st.ID
	}
}
