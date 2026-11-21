"""Generate the Excel fixtures for the validate-path tests into ./fixtures/."""
import os
import openpyxl

COLS = ["Plan Name", "Period Group Name", "Payout Date", "Employee ID", "Employee First Name", "Employee Last Name",
        "Employee Start Date", "Employee End Date", "Tekion ID", "Dealer Name", "Product", "SKU ID", "Currency",
        "Product Status", "Go Live Date", "Signed Date", "Total Commission Calculated", "Total Commission Paid",
        "Total Commission Payable", "Commission Paid in Prior Payouts", "Commission Due This Payout",
        "Total Commission Due"]

BASE = dict(zip(COLS, ["Sales Plan 2026", "Q1 2026", "2026-11-15", "E1001", "Ava", "Stone", "2024-01-10", "",
                       "TK-0001", "Sunrise Motors", "ARC", "SKU-ARC-1", "USD", "live", "2026-09-01", "2026-08-15",
                       "3600", "3600", "3600", "0", "100", "100"]))


def row(**kw):
    r = dict(BASE)
    for k, v in kw.items():
        r[k.replace("_", " ")] = v
    return [r[c] for c in COLS]


FILES = {
    "clean_one_live": [row()],
    "empty_header_only": [],
    "unknown_status": [row(Product_Status="pending")],
    "live_missing_required": [row(Employee_First_Name="", Payout_Date="", Currency="")],
    "live_bad_amount_and_date": [row(Total_Commission_Payable="abc", Go_Live_Date="notadate")],
    "live_blank_amounts": [row(Total_Commission_Payable="", Total_Commission_Paid="")],
    "zero_commission_early": [row(Total_Commission_Payable="0", Total_Commission_Paid="0", Go_Live_Date="2026-09-01", Payout_Date="2026-11-15")],
    "zero_commission_late": [row(Total_Commission_Payable="0", Total_Commission_Paid="0", Go_Live_Date="2024-01-01", Payout_Date="2026-11-15")],
    "duplicate_deal": [row(), row()],
    "duplicate_deal_normalised": [row(Tekion_ID="TK-0001", Dealer_Name="Sunrise Motors", Employee_ID="E1001"),
                                   row(Tekion_ID="TK-0001", Dealer_Name="sunrise-motors", Employee_ID="E1001")],
    "too_many_employees": [row(Employee_ID="E1001", SKU_ID="SKU-1"), row(Employee_ID="E1002", SKU_ID="SKU-2"),
                           row(Employee_ID="E1003", SKU_ID="SKU-3")],
    "two_employees_ok": [row(Employee_ID="E1001", SKU_ID="SKU-1"), row(Employee_ID="E1002", SKU_ID="SKU-2")],
    "cancelled_no_amounts": [row(Product_Status="cancelled", Total_Commission_Payable="", Total_Commission_Paid="")],
    "cancelled_bad_amount": [row(Product_Status="cancelled", Total_Commission_Payable="n/a")],
    "cancelled_no_golive": [row(Product_Status="cancelled", Go_Live_Date="", Total_Commission_Payable="", Total_Commission_Paid="")],
    "status_synonyms": [row(Product_Status="Canceled"), row(Product_Status="Singed Lost", Tekion_ID="TK-0002"),
                        row(Product_Status="SIGNED", Tekion_ID="TK-0003"), row(Product_Status="Delivered", Tekion_ID="TK-0004"),
                        row(Product_Status="Expired", Tekion_ID="TK-0005"), row(Product_Status="scheduled", Tekion_ID="TK-0006"),
                        row(Product_Status="", Tekion_ID="TK-0007")],
    "non_live_missing_fields": [row(Product_Status="signed", Employee_First_Name="", Payout_Date="", Go_Live_Date="")],
    "live_number_formats": [row(Total_Commission_Payable="$3,600.00", Total_Commission_Paid="(3,600)", Go_Live_Date="9/1/2026", Payout_Date="15-Nov-2026")],
    "transition_signed_to_live": [row(Product_Status="live")],
    "transition_live_to_signed": [row(Product_Status="signed")],
    "transition_live_to_cancelled": [row(Product_Status="cancelled")],
    "mixed_many_errors": [row(), row(Product_Status="pending", Tekion_ID="TK-0002"),
                          row(Employee_First_Name="", Tekion_ID="TK-0003"),
                          row(Total_Commission_Payable="abc", Tekion_ID="TK-0004"),
                          row(Tekion_ID="TK-0005"), row(Tekion_ID="TK-0005")],
    "blank_rows_in_middle": [row(), [""] * len(COLS), row(Tekion_ID="TK-0002")],
}


def main():
    os.makedirs("fixtures", exist_ok=True)
    for name, rows in FILES.items():
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Sheet1"
        ws.append(COLS)
        for r in rows:
            ws.append(r)
        wb.save(f"fixtures/{name}.xlsx")
        print(name, len(rows))


if __name__ == "__main__":
    main()
