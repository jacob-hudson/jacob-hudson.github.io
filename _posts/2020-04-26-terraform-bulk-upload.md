---
layout: post
title:  "Bulk DynamoDB Population with Terraform"
date:   2020-04-27 18:24:27 -0500
categories: terraform aws dynamodb
---
# Overview

DynamoDB is great!  It can be used for routing and metadata table, be used to lock Terraform State files, track states of applications and much more!  This post will offer a solution for populating the data within a DynamoDB table at create-rime, entirely within Terraform.  

The issue I am looking to solve here is to provision a DynamoDB lookup table without from Terraform, without involving extra steps that Terraform can not invoke, without a ton of extra work, and something that can be easily re-producible and scalable.

The code is available here for those who just want to get to the solution:  https://github.com/jacob-hudson/terraform-bulk-upload.  I am using version 0.12.24, but anything 0.12+ should work without issue.  In addition, the AWS User/Role to run this configuration also needs to be able to use `dynamodb:CreateTable` and `dynamodb:BatchWriteItem`.

Requirements:
1.  It has to be able to be invoked form Terraform
2.  It has to be able to be committed in Version Control
3.  It has to work on any number of items for DynamoDB
4.  Ideally, no other dependencies should be needed

# Current Problem

Provisioning an empty DynamoDB table in Terraform is quite easy, an example is below:

{% highlight hcl %}
resource "aws_dynamodb_table" "basic-dynamodb-table" {
  name           = "GameScores"
  billing_mode   = "PROVISIONED"
  read_capacity  = 20
  write_capacity = 20
  hash_key       = "UserId"

  attribute {
    name = "UserId"
    type = "S"
  }


  tags = {
    Name        = "dynamodb-table-1"
    Environment = "production"
  }
}
{% endhighlight %}

Source:  https://www.terraform.io/docs/providers/aws/r/dynamodb_table.html

This will result in a blank table, that has to be managed later.  HashiCorp does offer a solution for managing DynamoDB Items, as shown below:

{% highlight hcl %}
resource "aws_dynamodb_table_item" "example" {
  table_name = "${aws_dynamodb_table.example.name}"
  hash_key   = "${aws_dynamodb_table.example.hash_key}"

  item = <<ITEM
{
  "exampleHashKey": {"S": "something"},
  "one": {"N": "11111"},
  "two": {"N": "22222"},
  "three": {"N": "33333"},
  "four": {"N": "44444"}
}
ITEM
}
{% endhighlight %}

This works quite well, but is limited to one item per Terraform resource.  That does not scale well, and produces massive Terraform Configuration files.  In fact, the Terraform Documentation itself gives the same warning:

```
Note: This resource is not meant to be used for managing large amounts of data in your table, it is not designed to scale. You should perform regular backups of all data in the table, see AWS docs for more.
```

This is clearly not an optimal solution, so what can be done?  Let's see what AWS has to offer, since DynamoDB is an AWS Product.

# `PutItem` vs `BatchWriteItem`

DynamoDB offers a fwe methods for writing data to tables, `PutItem` and `BatchWriteItem`.  Some key details of each is below:

## `PutItem`
- Is used to upload a single item
- Can determine if the field exists before uploading

PutItem looks like what the `dynamodb_table_item` resource is using in the previous section.  

## `BatchWriteItem`
- Can upload many items to a table at once
- Will simply overwrite all items that have matching Primary Keys

It looks as we have a working solution, as `BatchWriteItem` will load as many items into a table as we like, will be able to do everything at once, and we can centralize data management of the table.

Now, how can we get this to be invoked solely from Terraform?

# `Local-Exec` Provisioner

A provisioner in Terraform allows for the execution of a file into either the local machine running Terraform for the machine Terraform just provisioned.  In a little known fact for Terraform, `local-exec` will run on any resource, not just EC2!

An example of using local-exec with EC2 is below:
{% highlight hcl %}
resource "aws_instance" "web" {
  # ...

  provisioner "local-exec" {
    command = "echo The server's IP address is ${self.private_ip}"
  }
}
{% endhighlight %}

The example above is for EC2; However, `local-exec` can run for any AWS resource, including DynamoDB!

# Solution
Alright, so we now have the following:
- A Terraform Configuration to Build a DynamoDB Table
- A Method for uploading multiple items to said table
- A Solution for executing the dataload from Terraform

The only thing left now is to put everything together!

In this example,  I have provisioned a very simple DynamoDB table, with 1 unite of Read and Write capacity, no encryption, no streams, and no Autoscaling.  Within the DynamoDB resource, I invoke the `local-exec` provisioner to kick off a Shell script on the same machine that is running Terraform (which also has the AWSCLI installed), this will run `BatchWriteItem` for the table I just created and load all of the sample data.

