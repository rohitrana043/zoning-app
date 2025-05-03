package com.realestate.zoningupdate.dto;

import lombok.Data;
import java.util.Map;

@Data
public class ParcelDTO {
    private Integer id;
    private Map<String, Object> geometry;
    private String name;
    private String owner;
    private String mailCity;
    private String mailZip;
    private String mailadd;
    private String parcelnumb;
    private String zoning;
    private String zoningSub;
    private String zoningType;
}
