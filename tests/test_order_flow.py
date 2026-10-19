import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class OrderFlowContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.script = (ROOT / "script.js").read_text(encoding="utf-8")
        cls.css = (ROOT / "styles.css").read_text(encoding="utf-8")
        cls.code = (ROOT / "apps-script" / "Code.gs").read_text(encoding="utf-8") if (ROOT / "apps-script" / "Code.gs").exists() else ""
        cls.form = (ROOT / "apps-script" / "Form.html").read_text(encoding="utf-8") if (ROOT / "apps-script" / "Form.html").exists() else ""

    def test_pages_embeds_a_single_post_seeded_order_form(self):
        self.assertIn('id="order-form-embed"', self.html)
        self.assertRegex(self.html, r'<iframe[^>]+id="order-form-frame"')
        self.assertIn('data-order-form-url=', self.html)
        self.assertIn("action=seed", self.script)
        self.assertIn('seedField.name = "seed"', self.script)
        self.assertIn('method = "POST"', self.script)
        self.assertIn("var frame = document.getElementById(\"order-form-frame\")", self.script)
        self.assertNotIn("orderFrame.addEventListener(\"resize\"", self.script)

    def test_order_form_uses_the_verified_apps_script_endpoint(self):
        self.assertIn(
            'data-order-form-url="https://script.google.com/macros/s/AKfycbydFuwmR32zO3Sj28a1YWZNTgThHctu-LnpkWVJAkUOQZfRgnzS1qTfbb2JeHvYa-Qg/exec"',
            self.html,
        )
        self.assertNotIn("REPLACE_WITH_APPS_SCRIPT_DEPLOYMENT_ID", self.html)

    def test_configured_order_form_has_current_start_instruction(self):
        self.assertIn("Select \u201cStart an order\u201d on a catalogue card or the customizer to begin.", self.html)
        self.assertNotIn("The request form is not configured for this preview yet.", self.html)

    def test_catalogue_and_customizer_actions_use_stable_source_prefills(self):
        self.assertIn("data-order-prefill", self.script)
        self.assertIn("sourceId", self.script)
        self.assertIn("customizer", self.script)
        self.assertRegex(self.html, r'id="order-from-customizer"')
        self.assertNotIn("order-form-draft", self.form)
        self.assertIn("This order form is already loaded", self.script)
        self.assertIn("frameState.loaded", self.script)

    def test_form_has_editable_request_fields_and_failure_safe_submission(self):
        for field in (
            "requestId", "sourceKind", "sourceId", "productName", "quantity",
            "height", "heightUnit", "width", "widthUnit", "designDetails",
            "customerName", "phone", "email", "fulfillment", "shippingAddress",
            "city", "state", "pin", "requestedDate", "referenceImage",
        ):
            with self.subTest(field=field):
                self.assertRegex(self.form, rf'name=["\']{field}["\']')
        self.assertIn("google.script.run", self.form)
        self.assertIn("withSuccessHandler", self.form)
        self.assertIn("withFailureHandler", self.form)
        self.assertIn("submitOrder(formElement)", self.form)
        self.assertIn("Start another request", self.form)
        self.assertIn("unable to confirm", self.form.lower())
        self.assertIn("5 MB", self.form)
        self.assertIn("Google", self.form)

    def test_apps_script_is_server_only_and_defends_the_sheet_boundary(self):
        self.assertIn("function doGet", self.code)
        self.assertIn("function doPost", self.code)
        self.assertIn("action === \"seed\"", self.code)
        self.assertIn("submitOrder", self.code)
        self.assertIn("ALLOWALL", self.code)
        self.assertNotRegex(self.code, r'doPost[\s\S]{0,300}appendRow')
        for token in (
            "ORDER_SHEET_ID", "ORDER_DRIVE_FOLDER_ID", "LockService",
            "payloadFingerprint", "neutralizeForSheet", "getBytes",
            "getContentType", "CAPTCHA_SECRET", "CAPTCHA_EXPECTED_HOSTNAME",
            "ORDER_FORM_DISABLED", "DAILY_ACCEPTANCE_CAP", "setTrashed",
        ):
            with self.subTest(token=token):
                self.assertIn(token, self.code)
        self.assertIn("New request", self.code)
        self.assertIn("sourceId", self.code)
        self.assertIn("receivedAt", self.code)

    def test_dimensions_and_formula_safety_are_explicitly_tested(self):
        self.assertRegex(self.code, r'48')
        self.assertRegex(self.code, r'feet|ft')
        self.assertRegex(self.code, r'5\s*\*\s*1024\s*\*\s*1024|5\s*MB')
        self.assertIn("startsWith(\"=\")", self.code)
        self.assertIn("startsWith(\"+\")", self.code)
        self.assertIn("startsWith(\"-\")", self.code)
        self.assertIn("startsWith(\"@\")", self.code)
        self.assertIn("signature", self.code)

    def test_privacy_and_deployment_docs_are_present(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("Apps Script", readme)
        self.assertIn("rollback", readme.lower())
        self.assertIn("retention", readme.lower())
        self.assertIn("correction", readme.lower())
        self.assertIn("saloniresin_art_studio", self.html)


if __name__ == "__main__":
    unittest.main()
