"""
Unit tests for WellMech calculation functions.

Benchmark data sources:
  - Johancsik (1984) SPE-11380-PA: T&D model fundamentals
  - Bourgoyne et al. (1986) "Applied Drilling Engineering": hydraulics formulas
  - SPE-105068 (Mitchell & Samuel, 2009): μ_torque ≠ μ_drag
"""

import math
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Patch Flask to avoid full app init in tests
import importlib
import unittest.mock as mock

# We only need pure-function imports; avoid Flask startup side effects
with mock.patch.dict('sys.modules', {
    'flask': mock.MagicMock(),
    'pandas': mock.MagicMock(),
    'numpy': mock.MagicMock(),
    'matplotlib': mock.MagicMock(),
    'matplotlib.pyplot': mock.MagicMock(),
    'openpyxl': mock.MagicMock(),
    'openpyxl.styles': mock.MagicMock(),
    'reportlab': mock.MagicMock(),
    'reportlab.lib': mock.MagicMock(),
    'reportlab.lib.pagesizes': mock.MagicMock(),
    'reportlab.lib.units': mock.MagicMock(),
    'reportlab.lib.styles': mock.MagicMock(),
    'reportlab.lib.colors': mock.MagicMock(),
    'reportlab.platypus': mock.MagicMock(),
    'reportlab.pdfbase': mock.MagicMock(),
    'reportlab.pdfbase.pdfmetrics': mock.MagicMock(),
    'reportlab.pdfbase.ttfonts': mock.MagicMock(),
}):
    import app as wellmech


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def vertical_survey(depth_m):
    """Simple vertical well survey."""
    return [
        {'depth': 0.0,     'inclination': 0.0, 'azimuth': 0.0},
        {'depth': depth_m, 'inclination': 0.0, 'azimuth': 0.0},
    ]


def buildup_survey(kop, eob, eob_incl, total_depth):
    """
    Simple build-up section: vertical to KOP, builds to EOB inclination, then holds.
    """
    dls_per_m = eob_incl / (eob - kop)  # deg/m
    return [
        {'depth': 0.0,        'inclination': 0.0,      'azimuth': 0.0},
        {'depth': kop,        'inclination': 0.0,      'azimuth': 0.0},
        {'depth': eob,        'inclination': eob_incl, 'azimuth': 0.0},
        {'depth': total_depth,'inclination': eob_incl, 'azimuth': 0.0},
    ]


# ─────────────────────────────────────────────────────────────
# 1. Survey interpolation
# ─────────────────────────────────────────────────────────────

class TestInterpolateSurvey:
    def test_exact_point(self):
        survey = vertical_survey(1000.0)
        incl, azim = wellmech.interpolate_survey(survey, 0.0)
        assert incl == 0.0
        assert azim == 0.0

    def test_beyond_end_returns_last(self):
        survey = vertical_survey(1000.0)
        incl, azim = wellmech.interpolate_survey(survey, 2000.0)
        assert incl == 0.0

    def test_mid_interpolation(self):
        survey = [
            {'depth': 0.0,    'inclination': 0.0,  'azimuth': 0.0},
            {'depth': 100.0,  'inclination': 30.0, 'azimuth': 90.0},
        ]
        incl, azim = wellmech.interpolate_survey(survey, 50.0)
        assert abs(incl - 15.0) < 1e-9
        assert abs(azim - 45.0) < 1e-9


# ─────────────────────────────────────────────────────────────
# 2. Johancsik T&D — vertical well (no friction component in N)
# ─────────────────────────────────────────────────────────────

class TestJohancsikVertical:
    """
    In a perfectly vertical well there is no contact force, so
    hookload (RIH/POOH) equals buoyed string weight regardless of μ.
    """

    def _make_assembly(self, length_m, od_mm, id_mm, linwt_kgm):
        # weight_air in kg
        weight_air = linwt_kgm * length_m
        return [{
            'name': 'Drill Pipe',
            'length': length_m,
            'od': od_mm,
            'id': id_mm,
            'weight_air': weight_air,
            'weight_per_unit': linwt_kgm,
        }]

    def test_hookload_rih_equals_pooh_vertical(self):
        """In vertical well RIH and POOH hookloads must be equal (no N)."""
        assembly = self._make_assembly(1000.0, 127.0, 108.0, 20.0)
        survey = vertical_survey(1000.0)

        res_down, _ = wellmech.johancsik_run(
            assembly, survey, 1000.0, 1.2, 0.25, None, 'down')
        res_up, _ = wellmech.johancsik_run(
            assembly, survey, 1000.0, 1.2, 0.25, None, 'up')

        hook_down = res_down[-1]['force']
        hook_up   = res_up[-1]['force']
        assert abs(hook_down - hook_up) < 0.01, (
            f"Vertical well: RIH={hook_down:.3f} kN ≠ POOH={hook_up:.3f} kN")

    def test_buoyed_weight_vertical(self):
        """Hookload equals buoyed string weight (no friction, no deviation)."""
        length_m   = 1000.0
        linwt_kgm  = 20.0
        rho_mud    = 1.2
        bf = 1.0 - rho_mud / wellmech.STEEL_DENSITY
        expected_kN = length_m * linwt_kgm * bf * wellmech.G / 1000.0

        assembly = self._make_assembly(length_m, 127.0, 108.0, linwt_kgm)
        survey   = vertical_survey(length_m)
        res, _   = wellmech.johancsik_run(
            assembly, survey, length_m, rho_mud, 0.25, None, 'down')

        hook = res[-1]['force']
        assert abs(hook - expected_kN) < 0.5, (
            f"Buoyed weight {expected_kN:.2f} kN ≠ hookload {hook:.2f} kN")


# ─────────────────────────────────────────────────────────────
# 3. Johancsik T&D — deviated well (friction window)
# ─────────────────────────────────────────────────────────────

class TestJohancsikDeviated:
    def _simple_bha(self, depth_m):
        return [{
            'name': 'Drill Pipe',
            'length': depth_m,
            'od': 127.0,
            'id': 108.0,
            'weight_air': depth_m * 20.0,
            'weight_per_unit': 20.0,
        }]

    def test_rih_less_than_pooh(self):
        """POOH hookload > RIH hookload in deviated well."""
        survey = buildup_survey(kop=200, eob=600, eob_incl=45, total_depth=1000)
        asm    = self._simple_bha(1000.0)

        res_d, _ = wellmech.johancsik_run(asm, survey, 1000.0, 1.2, 0.25, None, 'down')
        res_u, _ = wellmech.johancsik_run(asm, survey, 1000.0, 1.2, 0.25, None, 'up')

        assert res_u[-1]['force'] > res_d[-1]['force'], (
            "POOH hookload should exceed RIH in deviated well")

    def test_higher_mu_widens_window(self):
        """Higher μ increases the RIH-POOH hookload difference."""
        survey = buildup_survey(kop=200, eob=600, eob_incl=45, total_depth=1000)
        asm    = self._simple_bha(1000.0)

        def window(mu):
            d, _ = wellmech.johancsik_run(asm, survey, 1000.0, 1.2, mu, None, 'down')
            u, _ = wellmech.johancsik_run(asm, survey, 1000.0, 1.2, mu, None, 'up')
            return u[-1]['force'] - d[-1]['force']

        assert window(0.35) > window(0.15), "Higher μ should widen hookload window"

    def test_mu_torque_separate_from_drag(self):
        """
        SPE-105068: providing distinct mu_torque should not change drag forces,
        only affect torque computation pathway.
        """
        survey = buildup_survey(kop=200, eob=600, eob_incl=45, total_depth=1000)
        asm    = self._simple_bha(1000.0)

        _, segs_base = wellmech.johancsik_run(
            asm, survey, 1000.0, 1.2, 0.25, None, 'down', mu_torque=None)
        _, segs_mt   = wellmech.johancsik_run(
            asm, survey, 1000.0, 1.2, 0.25, None, 'down', mu_torque=0.20)

        # Drag (axial force) must be identical regardless of mu_torque
        for s1, s2 in zip(segs_base, segs_mt):
            assert abs(s1['friction'] - s2['friction']) < 1e-6, (
                "mu_torque must not affect drag friction component")

        # mu_torque should be stored in segment
        assert segs_mt[0]['mu_torque'] == 0.20


# ─────────────────────────────────────────────────────────────
# 4. Bending stiffness EI
# ─────────────────────────────────────────────────────────────

class TestCalcEI:
    def test_positive_result(self):
        """EI must be positive for any valid pipe geometry."""
        EI = wellmech.calc_EI(od_mm=127.0, linwt_kgm=20.0)
        assert EI > 0.0

    def test_larger_od_higher_EI(self):
        """Larger OD → higher bending stiffness (I ∝ d⁴)."""
        EI_small = wellmech.calc_EI(od_mm=127.0, linwt_kgm=20.0)
        EI_large = wellmech.calc_EI(od_mm=178.0, linwt_kgm=35.0)
        assert EI_large > EI_small

    def test_zero_weight_returns_zero_or_small(self):
        """Zero linear weight means solid rod — still should return positive EI."""
        # With linwt=0, A=0, id_=0, so it behaves as solid rod
        EI = wellmech.calc_EI(od_mm=127.0, linwt_kgm=0.0)
        assert EI >= 0.0


# ─────────────────────────────────────────────────────────────
# 5. Centralizer factor
# ─────────────────────────────────────────────────────────────

class TestGetCentralizerFactor:
    def test_no_centralizers_returns_1(self):
        assert wellmech.get_centralizer_factor(500.0, []) == 1.0

    def test_exact_depth_match(self):
        cents = [{'depth': 500.0, 'standoff': 0.85, 'type': 'rigid'}]
        assert wellmech.get_centralizer_factor(500.0, cents) == 0.85

    def test_within_window(self):
        cents = [{'depth': 500.0, 'standoff': 0.70, 'type': 'bow'}]
        assert wellmech.get_centralizer_factor(503.0, cents, window=5.0) == 0.70

    def test_outside_window_returns_1(self):
        cents = [{'depth': 500.0, 'standoff': 0.70, 'type': 'bow'}]
        assert wellmech.get_centralizer_factor(510.0, cents, window=5.0) == 1.0


# ─────────────────────────────────────────────────────────────
# 6. Pipe pressure drop (_dp_pipe)
# ─────────────────────────────────────────────────────────────

class TestDpPipe:
    """
    Laminar benchmark: 5″ DP (ID=108mm), Q=1 L/s, ρ=1200 kg/m³,
    PV=30 cP (0.030 Pa·s), YP=10 Pa, L=1000 m
    v ≈ 0.109 m/s, Re = 1200*0.109*0.108/0.030 ≈ 470 → laminar
    Turbulent benchmark: same pipe, Q=25 L/s (Re≈17000) → turbulent
    """

    def _laminar_params(self):
        Q      = 0.001          # m³/s (1 L/s)
        d_i    = 0.108          # m
        rho    = 1200.0         # kg/m³
        mu_p   = 0.030          # Pa·s (30 cP)
        tau_y  = 10.0           # Pa (YP)
        L      = 1000.0         # m
        return Q, d_i, rho, mu_p, tau_y, L

    def _params(self):
        return self._laminar_params()

    def test_bingham_laminar_positive(self):
        Q, d_i, rho, mu_p, tau_y, L = self._laminar_params()
        dp, v, regime, Re = wellmech._dp_pipe(Q, d_i, rho, mu_p, tau_y, L, 'bingham')
        assert dp > 0
        assert regime == 'laminar', f"Expected laminar at Re={Re:.0f}"
        assert Re < 2100

    def test_bingham_returns_reasonable_pressure(self):
        Q, d_i, rho, mu_p, tau_y, L = self._laminar_params()
        dp, v, regime, Re = wellmech._dp_pipe(Q, d_i, rho, mu_p, tau_y, L, 'bingham')
        dp_kpa = dp / 1000.0
        # Laminar, low flow rate, YP-dominated: expect positive, physically bounded
        assert 0.1 < dp_kpa < 5000, f"Expected positive kPa, got {dp_kpa:.2f} kPa"

    def test_zero_flow_returns_zero(self):
        dp, v, regime, Re = wellmech._dp_pipe(0.0, 0.108, 1200, 0.02, 5.0, 1000)
        assert dp == 0.0

    def test_turbulent_at_high_flow(self):
        # Very high Q forces turbulent regime
        dp, v, regime, Re = wellmech._dp_pipe(
            Q=0.2, d_i=0.108, rho=1200, mu_p=0.02, tau_y=5.0, L=100)
        assert regime == 'turbulent'

    def test_power_law_positive(self):
        Q, d_i, rho, mu_p, tau_y, L = self._params()
        dp, v, regime, Re = wellmech._dp_pipe(
            Q, d_i, rho, mu_p, tau_y, L, 'power_law', n=0.8, K=0.5)
        assert dp >= 0

    def test_longer_pipe_higher_dp(self):
        Q, d_i, rho, mu_p, tau_y, _ = self._params()
        dp1, *_ = wellmech._dp_pipe(Q, d_i, rho, mu_p, tau_y, 500.0)
        dp2, *_ = wellmech._dp_pipe(Q, d_i, rho, mu_p, tau_y, 1000.0)
        assert dp2 > dp1


# ─────────────────────────────────────────────────────────────
# 7. Annulus pressure drop (_dp_annulus)
# ─────────────────────────────────────────────────────────────

class TestDpAnnulus:
    """
    Benchmark: 8.5″ open hole (D_o=216mm), 5″ DP (D_i=127mm),
    Q=25 L/s, ρ=1200, PV=20 cP, YP=5 Pa, L=1000 m
    Annular velocity ≈ 0.67 m/s → laminar
    """

    def _params(self):
        Q     = 0.025     # m³/s
        D_o   = 0.216     # m (8.5 in)
        D_i   = 0.127     # m (5 in)
        rho   = 1200.0
        mu_p  = 0.020
        tau_y = 5.0
        L     = 1000.0
        return Q, D_o, D_i, rho, mu_p, tau_y, L

    def test_bingham_annulus_positive(self):
        Q, D_o, D_i, rho, mu_p, tau_y, L = self._params()
        dp, v, regime, Re = wellmech._dp_annulus(Q, D_o, D_i, rho, mu_p, tau_y, L)
        assert dp > 0

    def test_annulus_dp_less_than_pipe_dp(self):
        """Annular ΔP/m should be lower than pipe ΔP/m for same flow rate."""
        Q, D_o, D_i, rho, mu_p, tau_y, L = self._params()
        dp_ann, *_ = wellmech._dp_annulus(Q, D_o, D_i, rho, mu_p, tau_y, L)
        dp_pip, *_ = wellmech._dp_pipe(Q, 0.108, rho, mu_p, tau_y, L)
        assert dp_ann < dp_pip, "Annular ΔP should be lower than pipe ΔP"

    def test_invalid_geometry_returns_zero(self):
        """D_o <= D_i is invalid."""
        dp, *_ = wellmech._dp_annulus(0.025, 0.100, 0.127, 1200, 0.02, 5.0, 1000)
        assert dp == 0.0


# ─────────────────────────────────────────────────────────────
# 8. Bit nozzle pressure drop (_dp_bit)
# ─────────────────────────────────────────────────────────────

class TestDpBit:
    """
    Benchmark: 3 × 12/32″ nozzles (12×0.0254/32 ≈ 0.00953 m each),
    Q=25 L/s, ρ=1200 kg/m³
    TFA = 3 × π(0.00953²)/4 ≈ 2.14×10⁻⁴ m²
    v_n = 0.025 / 2.14e-4 ≈ 116.8 m/s
    ΔP = 1200 × 116.8² / (2 × 0.95²) ≈ 9.0 MPa
    """

    def test_bit_dp_positive(self):
        nozzles = [12 * 0.0254 / 32] * 3   # 3 × 12/32 in
        dp = wellmech._dp_bit(Q=0.025, nozzle_diams_m=nozzles, rho=1200.0)
        assert dp > 0

    def test_bit_dp_reasonable_magnitude(self):
        nozzles = [12 * 0.0254 / 32] * 3
        dp = wellmech._dp_bit(Q=0.025, nozzle_diams_m=nozzles, rho=1200.0)
        dp_mpa = dp / 1e6
        assert 5 < dp_mpa < 20, f"Expected 5-20 MPa, got {dp_mpa:.2f} MPa"

    def test_larger_nozzles_lower_dp(self):
        nozzles_small = [10 * 0.0254 / 32] * 3
        nozzles_large = [14 * 0.0254 / 32] * 3
        dp_small = wellmech._dp_bit(0.025, nozzles_small, 1200.0)
        dp_large = wellmech._dp_bit(0.025, nozzles_large, 1200.0)
        assert dp_large < dp_small, "Larger nozzles should give lower bit ΔP"

    def test_no_nozzles_returns_zero(self):
        assert wellmech._dp_bit(0.025, [], 1200.0) == 0.0

    def test_zero_flow_returns_zero(self):
        nozzles = [12 * 0.0254 / 32] * 3
        assert wellmech._dp_bit(0.0, nozzles, 1200.0) == 0.0


# ─────────────────────────────────────────────────────────────
# 9. validate_survey
# ─────────────────────────────────────────────────────────────

class TestValidateSurvey:
    def test_valid_survey_passes(self):
        survey = vertical_survey(1000.0)
        # should not raise
        wellmech.validate_survey(survey)

    def test_single_point_raises(self):
        import pytest
        with pytest.raises(ValueError):
            wellmech.validate_survey([{'depth': 0, 'inclination': 0, 'azimuth': 0}])

    def test_negative_depth_raises(self):
        import pytest
        with pytest.raises(ValueError):
            wellmech.validate_survey([
                {'depth': -10, 'inclination': 0, 'azimuth': 0},
                {'depth': 100, 'inclination': 0, 'azimuth': 0},
            ])


# ─────────────────────────────────────────────────────────────
# 10. get_mu with intervals
# ─────────────────────────────────────────────────────────────

class TestGetMu:
    def test_no_intervals_returns_default(self):
        assert wellmech.get_mu(500.0, [], 0.25) == 0.25

    def test_matching_interval(self):
        intervals = [{'depth_from': 400, 'depth_to': 600, 'mu': 0.35}]
        assert wellmech.get_mu(500.0, intervals, 0.25) == 0.35

    def test_outside_interval_returns_default(self):
        intervals = [{'depth_from': 400, 'depth_to': 600, 'mu': 0.35}]
        assert wellmech.get_mu(700.0, intervals, 0.25) == 0.25
