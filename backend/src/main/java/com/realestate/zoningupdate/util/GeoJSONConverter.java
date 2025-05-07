package com.realestate.zoningupdate.util;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.realestate.zoningupdate.dto.ParcelDTO;
import com.realestate.zoningupdate.model.Parcel;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Polygon;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class GeoJSONConverter {

    private static final ObjectMapper objectMapper = new ObjectMapper();

    public static Map<String, Object> convertToGeoJSON(List<Parcel> parcels) {
        Map<String, Object> featureCollection = new HashMap<>();
        featureCollection.put("type", "FeatureCollection");

        List<Map<String, Object>> features = new ArrayList<>();

        for (Parcel parcel : parcels) {
            Map<String, Object> feature = new HashMap<>();
            feature.put("type", "Feature");

            Map<String, Object> properties = new HashMap<>();
            properties.put("id", parcel.getId());
            properties.put("name", parcel.getName());
            properties.put("owner", parcel.getOwner());
            properties.put("mail_city", parcel.getMail_city());
            properties.put("mail_zip", parcel.getMail_zip());
            properties.put("zoning", parcel.getZoning());
            properties.put("zoning_sub", parcel.getZoning_sub());
            properties.put("zoning_typ", parcel.getZoning_typ());
            properties.put("mailadd", parcel.getMailadd());

            feature.put("properties", properties);
            feature.put("geometry", convertPolygonToGeoJSON(parcel.getGeom()));

            features.add(feature);
        }

        featureCollection.put("features", features);
        return featureCollection;
    }

    private static Map<String, Object> convertPolygonToGeoJSON(Polygon polygon) {
        if (polygon == null) {
            return null;
        }

        Map<String, Object> geometry = new HashMap<>();
        geometry.put("type", "Polygon");

        List<List<List<Double>>> coordinates = new ArrayList<>();
        List<List<Double>> ring = new ArrayList<>();

        for (Coordinate coord : polygon.getExteriorRing().getCoordinates()) {
            List<Double> point = new ArrayList<>();
            point.add(coord.x);
            point.add(coord.y);
            ring.add(point);
        }

        coordinates.add(ring);
        geometry.put("coordinates", coordinates);

        return geometry;
    }

    public static ParcelDTO convertToDTO(Parcel parcel) {
        ParcelDTO dto = new ParcelDTO();
        dto.setId(parcel.getId());
        dto.setName(parcel.getName());
        dto.setOwner(parcel.getOwner());
        dto.setMailCity(parcel.getMail_city());
        dto.setMailZip(parcel.getMail_zip());
        dto.setMailadd(parcel.getMailadd());
        dto.setParcelnumb(parcel.getParcelnumb());
        dto.setZoning(parcel.getZoning());
        dto.setZoningSub(parcel.getZoning_sub());
        dto.setZoningType(parcel.getZoning_typ());
        dto.setGeometry(convertPolygonToGeoJSON(parcel.getGeom()));

        return dto;
    }
}