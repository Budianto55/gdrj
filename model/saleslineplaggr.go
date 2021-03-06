package gdrj

import (
	"errors"
	"fmt"
	"github.com/eaciit/dbox"
	"github.com/eaciit/toolkit"
	"math"
	"strings"
	"time"
)

type SalesPLParam struct {
	PLs     []string    `json:"pls"`
	Groups  []string    `json:"groups"`
	Aggr    string      `json:"aggr"`
	Filters []toolkit.M `json:"filters"`
}

func (s *SalesPLParam) GetPLModels() ([]*PLModel, error) {
	res := []*PLModel{}

	q := DB().Connection.NewQuery().From(new(PLModel).TableName())
	defer q.Close()

	if len(s.PLs) > 0 {
		filters := []*dbox.Filter{}
		for _, pl := range s.PLs {
			filters = append(filters, dbox.Eq("_id", pl))
		}
		q = q.Where(dbox.Or(filters...))
	}

	csr, err := q.Cursor(nil)
	if err != nil {
		return nil, err
	}
	defer csr.Close()

	err = csr.Fetch(&res, 0, false)
	if err != nil {
		return nil, err
	}

	return res, nil
}

func (s *SalesPLParam) GetData() ([]*toolkit.M, error) {
	// plmodels, err := s.GetPLModels()
	// if err != nil {
	// 	return nil, err
	// }
	var yo = "plby_fiscal_only"

	// q := DB().Connection.NewQuery().From(new(SalesPL).TableName())
	// defer q.Close()

	// if len(s.Filters) > 0 {
	// 	q = q.Where(s.ParseFilter())
	// }

	// if len(s.Groups) > 0 {
	// 	q = q.Group(s.Groups...)
	// }
	// for _, plmod := range plmodels {
	// 	op := fmt.Sprintf("$%s", s.Aggr)
	// 	field := fmt.Sprintf("$pldatas.%s.amount", plmod.ID)
	// 	q = q.Aggr(op, field, plmod.ID)
	// }
	if len(s.Groups[0]) > 0 {
		if s.Groups[0] == "customer.channelname" {
			yo = "plby_fiscal_channel"
		} else if s.Groups[0] == "customer.branchname" {
			yo = "plby_fiscal_branch"
		} else if s.Groups[0] == "customer.region" {
			yo = "plby_fiscal_region"
		} else if s.Groups[0] == "product.brand" {
			yo = "plby_fiscal_brand"
		}
	}

	q := DB().Connection.NewQuery().From(yo)
	defer q.Close()

	if len(s.Filters) > 0 {
		q = q.Where(s.ParseFilter())
	}

	c, e := q.Cursor(nil)
	if e != nil {
		return nil, errors.New("SummarizedLedgerSum: Preparing cursor error " + e.Error())
	}
	defer c.Close()

	ms := []*toolkit.M{}
	e = c.Fetch(&ms, 0, false)
	if e != nil {
		return nil, errors.New("SummarizedLedgerSum: Fetch cursor error " + e.Error())
	}

	for _, each := range ms {
		for key := range *each {
			if strings.Contains(key, "PL") {
				val := each.GetFloat64(key)
				if math.IsNaN(val) {
					each.Set(key, 0)
				}
			}
		}
		fmt.Printf("------ %#v\n", each)
	}

	return ms, nil
}

func (p *SalesPLParam) ParseFilter() *dbox.Filter {
	filters := []*dbox.Filter{}

	for _, each := range p.Filters {
		field := each.GetString("Field")

		switch each.GetString("Op") {
		case dbox.FilterOpIn:
			values := []string{}
			for _, v := range each.Get("Value").([]interface{}) {
				values = append(values, v.(string))
			}

			if len(values) > 0 {
				filters = append(filters, dbox.In(field, values))
			}
		case dbox.FilterOpGte:
			var value interface{} = each.GetString("Value")

			if value.(string) != "" {
				if field == "year" {
					t, err := time.Parse(time.RFC3339Nano, value.(string))
					if err != nil {
						fmt.Println(err.Error())
					} else {
						value = t.Year()
					}
				}

				filters = append(filters, dbox.Gte(field, value))
			}
		case dbox.FilterOpLte:
			var value interface{} = each.GetString("Value")

			if value.(string) != "" {
				if field == "year" {
					t, err := time.Parse(time.RFC3339Nano, value.(string))
					if err != nil {
						fmt.Println(err.Error())
					} else {
						value = t.Year()
					}
				}

				filters = append(filters, dbox.Lte(field, value))
			}
		case dbox.FilterOpEqual:
			value := each.GetString("Value")

			filters = append(filters, dbox.Eq(field, value))
		}
	}

	// for _, each := range filters {
	// fmt.Printf(">>>> %#v\n", *each)
	// }

	return dbox.And(filters...)
}

type SalesPLDetailParam struct {
	SalesPLParam

	PLCode         string `json:"plcode"`
	BreakdownBy    string `json:"breakdownby"`
	BreakdownValue string `json:"breakdownvalue"`
}

func (s *SalesPLDetailParam) GetData() ([]*toolkit.M, error) {
	q := DB().Connection.NewQuery().From(new(SalesPL).TableName())
	defer q.Close()

	filter := dbox.Eq(s.BreakdownBy, s.BreakdownValue)
	if len(s.Filters) > 0 {
		filter = dbox.And(filter, s.ParseFilter())
	}

	q.Select("_id", "cc.name", "customer.name", "customer.channelname", "customer.branchname", "product.name", "product.brand", "date.date", fmt.Sprintf("pldatas.%s.amount", s.PLCode), "salesqty", "grossamount", "discountamount", "taxamount", "netamount")

	q = q.Where(filter)

	c, e := q.Cursor(nil)
	if e != nil {
		return nil, errors.New("SummarizedLedgerSum: Preparing cursor error " + e.Error())
	}
	defer c.Close()

	ms := []*toolkit.M{}
	e = c.Fetch(&ms, 0, false)
	if e != nil {
		return nil, errors.New("SummarizedLedgerSum: Fetch cursor error " + e.Error())
	}

	return ms, nil
}

func (s *SalesPL) Save() error {
	e := Save(s)
	if e != nil {
		return errors.New(toolkit.Sprintf("[%v-%v] Error found : ", s.TableName(), "save", e.Error()))
	}
	return e
}

func (s *SalesPL) PrepareID() interface{} {
	return toolkit.Sprintf("%v_%v_%v_%v_%v_%v_%v_%v",
		s.Customer.ID, s.Product.ID, s.PC.ID, s.CC.ID, toolkit.RandomString(10), toolkit.RandomString(10), toolkit.RandomString(10), s.Date.Date)
}
